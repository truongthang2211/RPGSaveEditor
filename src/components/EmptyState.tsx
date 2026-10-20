import React, { useState } from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileUpload, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useFileUpload, useOpenPath } from '../hooks/useActions';
import { SAVE_FORMATS } from '../formats';
import { fileNameFromPath, pathSegments } from '../utils/path';
import { forgetRecentFile, getRecentFiles } from '../utils/recentFiles';

const Wrapper = styled.div`
  margin: 48px auto 0;
  padding-bottom: 32px;
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
  margin: 12px auto 0;
  padding: 0;
  list-style: none;
  display: inline-grid;
  grid-template-columns: auto auto;
  gap: 4px 16px;
  text-align: left;
  font-size: 14px;
`;

const FormatDetails = styled.details`
  margin-top: 20px;
  font-size: 13px;
  opacity: 0.8;
`;

const FormatSummary = styled.summary`
  display: inline-block;
  cursor: pointer;
  &:hover {
    opacity: 1;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 3px;
    border-radius: 2px;
  }
`;

const RecentSection = styled.section`
  width: min(100%, 440px);
  margin: 24px auto 0;
  text-align: left;
`;

const RecentDetails = styled.details``;

const RecentSummary = styled.summary`
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 3px;
    border-radius: 2px;
  }
`;

const RecentList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const RecentRow = styled.li`
  display: flex;
  align-items: center;
  min-width: 0;
  border-radius: 6px;
  &:hover {
    background: ${({ theme }) => theme.hoverBackground};
  }
`;

const RecentOpenButton = styled.button`
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: -2px;
    border-radius: 6px;
  }
`;

const RecentFileName = styled.span`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
`;

const RecentFileLocation = styled.span`
  display: block;
  overflow: hidden;
  margin-top: 2px;
  opacity: 0.65;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
`;

const RemoveRecentButton = styled.button`
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  margin-right: 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  opacity: 0.65;
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.contentBackground};
    opacity: 1;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 1px;
  }
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
  const openPath = useOpenPath();
  const [recentFiles, setRecentFiles] = useState(getRecentFiles);
  const [recentExpanded, setRecentExpanded] = useState(true);

  const removeRecentFile = (filePath: string) => {
    setRecentFiles(forgetRecentFile(filePath));
  };

  return (
    <Wrapper>
      <Title>Edit your RPG save</Title>
      <Muted>Choose a file to get started.</Muted>
      <OpenButton onClick={openFile}>
        <FontAwesomeIcon icon={faFileUpload} /> Open save file
      </OpenButton>
      <Muted>
        or drag a save here · <Kbd>Ctrl</Kbd>+<Kbd>O</Kbd>
      </Muted>
      {recentFiles.length > 0 && (
        <RecentSection aria-label="Recent files">
          <RecentDetails
            open={recentExpanded}
            onToggle={(event) => setRecentExpanded(event.currentTarget.open)}
          >
            <RecentSummary>Recent files</RecentSummary>
            <RecentList>
              {recentFiles.slice(0, 5).map((filePath) => {
                const fileName = fileNameFromPath(filePath);
                const segments = pathSegments(filePath);
                const folder = segments.slice(-2, -1)[0] || filePath;

                return (
                  <RecentRow key={filePath}>
                    <RecentOpenButton
                      type="button"
                      title={filePath}
                      onClick={() => void openPath(filePath)}
                    >
                      <RecentFileName>{fileName}</RecentFileName>
                      <RecentFileLocation>{folder}</RecentFileLocation>
                    </RecentOpenButton>
                    <RemoveRecentButton
                      type="button"
                      aria-label={`Remove ${fileName} from recent files`}
                      title="Remove from recent files"
                      onClick={() => removeRecentFile(filePath)}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </RemoveRecentButton>
                  </RecentRow>
                );
              })}
            </RecentList>
          </RecentDetails>
        </RecentSection>
      )}
      <FormatDetails>
        <FormatSummary>Supported formats ({SAVE_FORMATS.length})</FormatSummary>
        <Formats aria-label="Supported formats">
          {SAVE_FORMATS.map((format) => (
            <React.Fragment key={format.id}>
              <li>{format.label}</li>
              <li>{format.extensions.map((ext) => `.${ext}`).join(', ')}</li>
            </React.Fragment>
          ))}
        </Formats>
      </FormatDetails>
    </Wrapper>
  );
};

export default EmptyState;
