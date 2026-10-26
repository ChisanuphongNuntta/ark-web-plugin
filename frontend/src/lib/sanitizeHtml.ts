import DOMPurify from 'isomorphic-dompurify';

/**
 * Clean CMS/admin-authored HTML before it goes into dangerouslySetInnerHTML.
 * Keeps normal markup; drops scripts, event handlers, javascript: URLs, iframes and forms.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
