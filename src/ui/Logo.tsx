import { APP_NAME } from "../config";

/**
 * The Lightsmith logo: an anvil throwing beams of colored light, and the
 * name, glowing. Served from public/, next to index.html, so the path is
 * relative to the page and works wherever the site is hosted.
 */
export function Logo() {
  return (
    <span className="logo">
      <img className="logo-img" src="lightsmith-logo.png" alt={APP_NAME} width={280} height={79} />
      {/* The anvil alone, for the folded sidebar. */}
      <img className="logo-mark" src="favicon.png" alt="" width={36} height={36} />
    </span>
  );
}
