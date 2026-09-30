// markdown-it only passes single entity references such as "&amp;" here.
// The browser already knows every named entity, so let it decode them
// instead of shipping a 75 KB table. <textarea> content is never executed.
let textarea: HTMLTextAreaElement | undefined
export function decodeHTML(entity: string): string {
  textarea ??= document.createElement('textarea')
  textarea.innerHTML = entity
  return textarea.value
}
// markdown-it's entity rule has already required the trailing ";".
export const decodeHTMLStrict = decodeHTML
