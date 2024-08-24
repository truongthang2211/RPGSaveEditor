import React from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileUpload, faRedo, faSave, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { useFileUpload, useReload, useSave } from '../hooks/useActions';
import { useContent } from '../context/ContentContext';
import Tooltip from './Tooltip';

const HeaderContainer = styled.div`
  grid-column: 1 / span 2;
  display: flex;
  align-items: center;
  background-color: ${({ theme }) => theme.headerBackground};
  padding: 10px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.primaryColor};
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 0 0 8px 8px;
`;

const FileName = styled.span`
  flex: 1;
  text-align: left;
  color: ${({ theme }) => theme.color};
  font-size: 16px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: 16px; /* Thay đổi khoảng cách giữa FileName và nút Upload */
`;

const IconButton = styled.div`
  cursor: pointer;
  color: ${({ theme }) => theme.color};
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s ease;
  margin-left: 8px; /* Khoảng cách giữa các icon */

  &:first-child {
    margin-left: 0; /* Xóa khoảng cách cho icon đầu tiên */
  }

  &:hover {
    color: ${({ theme }) => theme.primaryColor};
  }
`;

const SwitchButton = styled(IconButton)`
  margin-left: 16px; /* Thay đổi khoảng cách cho nút chuyển đổi theme */
`;

interface HeaderProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleTheme, isDarkMode }) => {
  const uploadFile = useFileUpload();
  const save = useSave();
  const reload = useReload();
  const { content } = useContent();

  return (
    <HeaderContainer>
      <IconButton onClick={uploadFile}>
        <Tooltip text='Open File (Ctrl+O)' width='400%' placement='right' fontSize='12px'>
          <FontAwesomeIcon icon={faFileUpload} />
        </Tooltip>
      </IconButton>
      <FileName>{content.fileName ? `${content.fileName} | ${content.gameName}` : ''}</FileName>
      <IconButton onClick={save}>
        <Tooltip text='Save File (Ctrl+S)' width='300%' placement='bottom' fontSize='12px'>
          <FontAwesomeIcon icon={faSave} />
        </Tooltip>
      </IconButton>
      <SwitchButton onClick={toggleTheme}>
      <Tooltip text='Change Theme' width='300%' placement='bottom' fontSize='12px'>
        <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} />
      </Tooltip>

      </SwitchButton>

      <IconButton onClick={reload}>
        <Tooltip text='Reload File (Ctrl+R)' width='300%' placement='bottom' fontSize='12px'>
          <FontAwesomeIcon icon={faRedo} />
        </Tooltip>
      </IconButton>
    </HeaderContainer>
  );
};

export default Header;
