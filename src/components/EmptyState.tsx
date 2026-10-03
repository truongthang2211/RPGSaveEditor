import React from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileUpload } from '@fortawesome/free-solid-svg-icons';
import { useFileUpload } from '../hooks/useActions';
import { SAVE_FORMATS } from '../formats';

const Wrapper = styled.div`
  margin: 48px auto;
  max-width: 520px;
  text-align: center;
  color: ${({ theme }) => theme.color};
`;

const Title = styled.h2`
  margin: 0 0 8px;
  font-size: 22px;
`;

const Muted = styled.p`
  margin: 8px 0;
  opacity: 0.75;
`;

const OpenButton = styled.button`
  margin: 20px 0;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  background-color: ${({ theme }) => theme.selectedBackground};
  &:hover {
    filter: brightness(1.08);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 2px;
  }
`;

const Formats = styled.ul`
  margin: 16px auto 0;
  padding: 0;
  list-style: none;
  display: inline-grid;
  grid-template-columns: auto auto;
  gap: 4px 16px;
  text-align: left;
  font-size: 14px;
`;

const Kbd = styled.kbd`
  padding: 1px 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: 4px;
  font-size: 12px;
`;

/** Shown instead of an empty page until a save is opened. */
const EmptyState: React.FC = () => {
  const openFile = useFileUpload();

  return (
    <Wrapper>
      <Title>Open a save file to start</Title>
      <Muted>Edit gold, items, characters, switches and variables of RPG Maker games.</Muted>
      <OpenButton onClick={openFile}>
        <FontAwesomeIcon icon={faFileUpload} /> Open save file
      </OpenButton>
      <Muted>
        or drag a save onto this window · <Kbd>Ctrl</Kbd>+<Kbd>O</Kbd>
      </Muted>
      <Formats aria-label="Supported formats">
        {SAVE_FORMATS.map((format) => (
          <React.Fragment key={format.id}>
            <li>{format.label}</li>
            <li>{format.extensions.map((ext) => `.${ext}`).join(', ')}</li>
          </React.Fragment>
        ))}
      </Formats>
    </Wrapper>
  );
};

export default EmptyState;
