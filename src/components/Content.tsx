import React from 'react';
import styled from 'styled-components';
import PartyContent from './PartyContent';
import InventoryContent from './InventoryContent';
import SwitchesContent from './SwitchesContent';
import VariablesContent from './VariablesContent';
import AboutContent from './AboutContent';
import AdvancedContent from './AdvancedContent';
import ErrorBoundary from './ErrorBoundary';
import EmptyState from './EmptyState';
import { useContent } from '../context/ContentContext';

const ContentContainer = styled.div`
  flex: 1;
`;

interface ContentProps {
  page: string;
}

const Content: React.FC<ContentProps> = ({ page }) => {
  const { content } = useContent();
  let displayContent: JSX.Element;

  if (!content.format && page !== 'About') {
    return (
      <ContentContainer>
        <EmptyState />
      </ContentContainer>
    );
  }

  switch (page) {
    case 'Party':
      displayContent = <PartyContent />;
      break;
    case 'Items':
      displayContent = <InventoryContent key="items" kind="items" label="Item" />;
      break;
    case 'Switches':
      displayContent = <SwitchesContent />;
      break;
    case 'Variables':
      displayContent = <VariablesContent />;
      break;
    case 'Weapons':
      displayContent = <InventoryContent key="weapons" kind="weapons" label="Weapon" />;
      break;
    case 'Armors':
      displayContent = <InventoryContent key="armors" kind="armors" label="Armor" />;
      break;
    case 'Advanced':
      displayContent = <AdvancedContent />;
      break;
    case 'About':
      displayContent = <AboutContent />;
      break;
    default:
      displayContent = <div>Select an item from the sidebar</div>;
  }

  return (
    <ContentContainer>
      {/* A new page, file or reload clears a previous rendering error. */}
      <ErrorBoundary resetKeys={[page, content.filePath, content.originSaveData]}>
        {displayContent}
      </ErrorBoundary>
      {/* <pre>{JSON.stringify(content.saveData, null, 2)}</pre> */}
    </ContentContainer>
  );
};

export default Content;
