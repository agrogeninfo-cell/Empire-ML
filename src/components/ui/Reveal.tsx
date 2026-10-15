import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Reveal — the `.scroll-rise` + IntersectionObserver behaviour from the
 * source artefact, as a reusable component.
 * ═════════════════════════════════════════════════════════════════════ */

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** stagger in ms */
  delay?: number;
  once?: boolean;
  as?: ElementType;
  threshold?: number;
  id?: string;
}

export function Reveal({
  children,
  className,
  delay = 0,
  once = true,
  as: Tag = "div",
  threshold = 0.08,
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    // Above-the-fold content should never wait for a scroll event.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      setVisible(true);
      if (once) return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" },
    );

    io.observe(node);
    return () => io.disconnect();
  }, [once, threshold]);

  return (
    <Tag
      id={id}
      ref={ref as never}
      className={cn("scroll-rise", visible && "visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
