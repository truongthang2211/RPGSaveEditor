import React, { useEffect } from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faBox, faToggleOn, faCogs, faGun, faShieldHalved, faInfoCircle, faSitemap, IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { useContent } from '../context/ContentContext';
import { EditorPage } from '../formats';

const SidebarItem = styled.div<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  margin: 4px 0;
  padding: 10px;
  border-radius: 8px;
  transition: background-color 0.3s ease, color 0.3s ease;
  cursor: pointer;
  color: ${({ theme, $isSelected }) => $isSelected ? theme.selectedColor : theme.color};
  background-color: ${({ theme, $isSelected }) => $isSelected ? theme.selectedBackground : 'transparent'};

  &:hover {
    background-color: ${({ theme, $isSelected }) => $isSelected ? theme.selectedBackground : theme.hoverBackground};
    /* Keep the selected item's white text readable on its blue background. */
    color: ${({ theme, $isSelected }) => $isSelected ? theme.selectedColor : theme.primaryColor};
  }
`;

const Icon = styled(FontAwesomeIcon)`
  margin-right: 10px;
  font-size: 18px;
  width: 22px;
`;

const SidebarContainer = styled.div`
  display: flex;
  flex-direction: column;
  font-size: 14px;
  height: 100%;
`;

const SidebarContent = styled.div`
  flex: 1;
`;

const AboutSection = styled.div`
  margin-top: auto;
`;

interface SidebarProps {
  onSelect: (content: string) => void;
  selectedContent: string;
}

const PAGES: { page: EditorPage; icon: IconDefinition }[] = [
  { page: 'Party', icon: faUsers },
  { page: 'Items', icon: faBox },
  { page: 'Weapons', icon: faGun },
  { page: 'Armors', icon: faShieldHalved },
  { page: 'Switches', icon: faToggleOn },
  { page: 'Variables', icon: faCogs },
  { page: 'Advanced', icon: faSitemap },
];

const Sidebar: React.FC<SidebarProps> = ({ onSelect, selectedContent }) => {
  const { content } = useContent();
  // Formats list the pages that apply to them (e.g. Ren'Py: Variables and Advanced only).
  const supported = content.format?.pages;
  const pages = PAGES.filter(({ page }) => !supported || supported.includes(page));

  useEffect(() => {
    if (supported && selectedContent !== 'About' && !supported.includes(selectedContent as EditorPage)) {
      onSelect(supported[0]);
    }
  }, [supported, selectedContent, onSelect]);

  return (
    <SidebarContainer>
      <SidebarContent>
        {pages.map(({ page, icon }) => (
          <SidebarItem key={page} onClick={() => onSelect(page)} $isSelected={selectedContent === page}>
            <Icon icon={icon} />
            {page}
          </SidebarItem>
        ))}
      </SidebarContent>
      <AboutSection>
        <SidebarItem
          onClick={() => onSelect('About')}
          $isSelected={selectedContent === 'About'}
        >
          <Icon icon={faInfoCircle} />
          About
        </SidebarItem>
      </AboutSection>
    </SidebarContainer>
  );
};

export default Sidebar;
