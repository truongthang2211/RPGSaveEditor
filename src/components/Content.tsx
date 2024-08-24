import React from 'react';
import styled from 'styled-components';
import PartyContent from './PartyContent';
import ItemsContent from './ItemsContent';
import SwitchesContent from './SwitchesContent';
import VariablesContent from './VariablesContent';
import WeaponsContent from './WeaponsContent';
import ArmorsContent from './ArmorsContent';
import AboutContent from './AboutContent';

const ContentContainer = styled.div`
  flex: 1;
`;

interface ContentProps {
  page: string;
}

const Content: React.FC<ContentProps> = ({ page }) => {
  let displayContent: JSX.Element;

  switch (page) {
    case 'Party':
      displayContent = <PartyContent />;
      break;
    case 'Items':
      displayContent = <ItemsContent />;
      break;
    case 'Switches':
      displayContent = <SwitchesContent />;
      break;
    case 'Variables':
      displayContent = <VariablesContent />;
      break;
    case 'Weapons':
      displayContent = <WeaponsContent />;
      break;
    case 'Armors':
      displayContent = <ArmorsContent />;
      break;
    case 'About':
      displayContent = <AboutContent />;
      break;
    default:
      displayContent = <div>Select an item from the sidebar</div>;
  }

  return (
    <ContentContainer>
      {displayContent}
      {/* <pre>{JSON.stringify(content.saveData, null, 2)}</pre> */}
    </ContentContainer>
  );
};

export default Content;
