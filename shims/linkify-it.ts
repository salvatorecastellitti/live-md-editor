// The editor never enables markdown-it's linkify option, so the real
// linkify-it is dead weight. This stub satisfies the constructor.
export default class LinkifyIt {
  test(): boolean {
    return false
  }
  match(): null {
    return null
  }
  matchAtStart(): null {
    return null
  }
  pretest(): boolean {
    return false
  }
}
