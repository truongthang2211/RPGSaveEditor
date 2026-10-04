import React, { RefObject, useEffect, useState } from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';

/** How far the page must be scrolled before the button shows. */
const SHOW_AFTER = 300;

const Button = styled.button`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 10;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.selectedBackground};
  color: ${({ theme }) => theme.selectedColor};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  opacity: 0.85;
  &:hover,
  &:focus-visible {
    opacity: 1;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 2px;
  }
`;

/** Floating "back to top" button for a scrolling container. */
const ScrollToTop: React.FC<{ target: RefObject<HTMLElement | null> }> = ({ target }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const update = () => setVisible(element.scrollTop > SHOW_AFTER);
    update();
    element.addEventListener('scroll', update, { passive: true });
    return () => element.removeEventListener('scroll', update);
  }, [target]);

  if (!visible) return null;
  return (
    <Button
      type="button"
      aria-label="Scroll to top"
      title="Scroll to top"
      onClick={() => target.current?.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <FontAwesomeIcon icon={faArrowUp} />
    </Button>
  );
};

export default ScrollToTop;
