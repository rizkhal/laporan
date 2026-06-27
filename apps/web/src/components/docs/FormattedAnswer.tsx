import { InlineCode } from "./InlineCode";

/**
 * Safely render FAQ answer strings that may contain <InlineCode> tags.
 * Replaces dangerouslySetInnerHTML with a parser that converts
 * <InlineCode>x</InlineCode> into the InlineCode React component.
 */
export function FormattedAnswer({ text }: { text: string }) {
  const parts = text.split(/(<InlineCode>.*?<\/InlineCode>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/<InlineCode>(.*?)<\/InlineCode>/);
        if (match) {
          return <InlineCode key={i}>{match[1]}</InlineCode>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
