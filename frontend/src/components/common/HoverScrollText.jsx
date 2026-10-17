import { useEffect, useRef, useState } from "react";
import "../../styles/hoverScrollText.css";

// One-line text that reveals overflow on hover/focus without resizing its row.
export default function HoverScrollText({ text, as: Element = "span", className = "" }) {
  const viewport = useRef(null);
  const content = useRef(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const measure = () => {
      if (!viewport.current || !content.current) return;
      const distance = Math.max(0, content.current.scrollWidth - viewport.current.clientWidth);
      setOverflow(previous => previous === distance ? previous : distance);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    observer.observe(content.current);
    const frame = requestAnimationFrame(measure);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [text]);
  return <Element ref={viewport} className={`hover-scroll-text ${className}`}
    data-overflow={overflow > 1 ? "true" : "false"} title={text}
    tabIndex={overflow > 1 ? 0 : undefined}
    style={{ "--hover-scroll-distance": `-${overflow}px`, "--hover-scroll-duration": `${Math.max(4, overflow / 60 + 1)}s` }}>
    <span className="hover-scroll-text__content" ref={content}>{text}</span>
  </Element>;
}
