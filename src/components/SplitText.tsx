import React, { useEffect, useMemo, useRef } from "react";
import { motion, useAnimationControls, useInView } from "framer-motion";

type SplitTextProps = {
  prefix: string;
  highlight: string;
  suffix: string;
  className?: string;
  delay?: number;
  stagger?: number;
  twoLines?: boolean;
  onComplete?: () => void;
};

type VariantCustom = { delay: number; stagger: number };

const parentVariants = {
  hidden: (custom: VariantCustom) => ({
    transition: {
      staggerChildren: custom.stagger,
      staggerDirection: -1,
    },
  }),
  show: (custom: VariantCustom) => ({
    transition: {
      delayChildren: custom.delay,
      staggerChildren: custom.stagger,
      staggerDirection: 1,
    },
  }),
};

const childVariants = {
  hidden: { y: "0.8em", opacity: 0 },
  show: { y: "0em", opacity: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

type RenderOptions = {
  wordClassName?: string;
  charClassName?: string;
};

function renderWord(word: string, keyPrefix: string, options: RenderOptions = {}) {
  const { wordClassName = "", charClassName = "" } = options;
  return (
    <span key={`${keyPrefix}-word`} className={`inline-block whitespace-pre ${wordClassName}`.trim()}>
      {Array.from(word).map((char, i) => (
        <motion.span
          key={`${keyPrefix}-char-${i}`}
          className={`inline-block will-change-transform ${charClassName}`.trim()}
          variants={childVariants}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

export const SplitText: React.FC<SplitTextProps> = ({
  prefix,
  highlight,
  suffix,
  className,
  delay = 0.35,
  stagger = 0.035,
  twoLines = false,
  onComplete,
}) => {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(containerRef, { margin: "-100px" });
  const controls = useAnimationControls();

  useEffect(() => {
    if (inView) {
      const animation = controls.start("show");
      if (onComplete) {
        animation.then(() => onComplete());
      }
    }
  }, [inView, controls, onComplete]);

  const prefixWords = useMemo(() => prefix.trim().split(/\s+/), [prefix]);
  const suffixWords = useMemo(() => suffix.trim().split(/\s+/), [suffix]);
  const trimmedHighlight = highlight.trim();
  const hasHighlight = trimmedHighlight.length > 0;

  return (
    <motion.span
      ref={containerRef}
      className={className}
      initial="hidden"
      animate={controls}
      variants={parentVariants}
      custom={{ delay, stagger }}
    >
      {/* prefix */}
      {prefixWords.map((w, idx) => (
        <React.Fragment key={`pre-${idx}`}>
          {renderWord(w, `pre-${idx}`)}
          {idx < prefixWords.length - 1 ? " " : null}
        </React.Fragment>
      ))}
      {/* space between prefix and highlight */}
      {prefixWords.length && hasHighlight ? " " : null}
      {/* highlight */}
      {hasHighlight
        ? renderWord(trimmedHighlight, "hl", {
            charClassName: "bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent",
          })
        : null}
      {/* space / line break between highlight and suffix */}
      {twoLines && hasHighlight ? <br /> : " "}
      {/* suffix */}
      {suffixWords.map((w, idx) => (
        <React.Fragment key={`suf-${idx}`}>
          {renderWord(w, `suf-${idx}`)}
          {idx < suffixWords.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </motion.span>
  );
};

export default SplitText;
