import React from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faBox, faToggleOn, faCogs, faGun, faShieldHalved, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

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
    color: ${({ theme }) => theme.primaryColor};
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

const Sidebar: React.FC<SidebarProps> = ({ onSelect, selectedContent }) => {
  return (
    <SidebarContainer>
      <SidebarContent>
        <SidebarItem
          onClick={() => onSelect('Party')}
          $isSelected={selectedContent === 'Party'}
        >
          <Icon icon={faUsers} />
          Party
        </SidebarItem>
        <SidebarItem
          onClick={() => onSelect('Items')}
          $isSelected={selectedContent === 'Items'}
        >
          <Icon icon={faBox} />
          Items
        </SidebarItem>
        <SidebarItem
          onClick={() => onSelect('Weapons')}
          $isSelected={selectedContent === 'Weapons'}
        >
          <Icon icon={faGun} />
          Weapons
        </SidebarItem>
        <SidebarItem
          onClick={() => onSelect('Armors')}
          $isSelected={selectedContent === 'Armors'}
        >
          <Icon icon={faShieldHalved} />
          Armors
        </SidebarItem>
        <SidebarItem
          onClick={() => onSelect('Switches')}
          $isSelected={selectedContent === 'Switches'}
        >
          <Icon icon={faToggleOn} />
          Switches
        </SidebarItem>
        <SidebarItem
          onClick={() => onSelect('Variables')}
          $isSelected={selectedContent === 'Variables'}
        >
          <Icon icon={faCogs} />
          Variables
        </SidebarItem>
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
