import React, { AnchorHTMLAttributes } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

const isTauri = () => '__TAURI_INTERNALS__' in window;

/**
 * Link that opens in the system browser. In the Tauri webview a plain
 * target="_blank" link does nothing (new windows are blocked), so the click
 * goes through the opener plugin instead.
 */
const ExternalLink: React.FC<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }> = ({
  href,
  onClick,
  ...rest
}) => (
  <a
    {...rest}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || !isTauri()) return;
      event.preventDefault();
      openUrl(href).catch((error) => console.error('Could not open link:', href, error));
    }}
  />
);

export default ExternalLink;
