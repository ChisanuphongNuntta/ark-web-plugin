/**
 * Typography for admin-authored HTML (policy versions, CMS html blocks).
 * The project has no @tailwindcss/typography plugin, and Preflight resets
 * headings/lists/links, so the styling is spelled out with arbitrary variants.
 * Lives under components/ so Tailwind's content scan picks the classes up.
 */
export const RICH_TEXT_HTML =
  'text-sm leading-[1.8] text-fg-muted ' +
  '[&_h1]:mt-10 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-fg ' +
  '[&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg ' +
  '[&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-fg ' +
  '[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 ' +
  '[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 ' +
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-medium [&_strong]:text-fg ' +
  '[&_blockquote]:mt-3 [&_blockquote]:border-l [&_blockquote]:border-line [&_blockquote]:pl-4 ' +
  '[&_code]:font-mono [&_code]:text-[13px] [&_code]:text-fg ' +
  '[&>*:first-child]:mt-0';
