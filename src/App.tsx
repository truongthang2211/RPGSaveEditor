import React, { useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Content from './components/Content';
import darkTheme from './themes/dark';
import lightTheme from './themes/light';
import './App.css'
import { ContentProvider } from './context/ContentContext';
import Hotkeys from './components/Hotkeys';
import { ToastContainer } from 'react-toastify';
import "react-toastify/dist/ReactToastify.css";

const AppContainer = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 200px 1fr; /* Giảm độ rộng của sidebar */
  height: 100vh;
  background-color: ${({ theme }) => theme.background};
  color: ${({ theme }) => theme.color};
  overflow: hidden;
`;

const SidebarContainer = styled.div`
  grid-row: 2 / span 1;
  background-color: ${({ theme }) => theme.sidebarBackground};
  display: flex;
  flex-direction: column;
  padding: 8px;
`;

const MainContentContainer = styled.div`
  grid-row: 2 / span 1;
  display: flex;
  flex-direction: column;
  padding: 12px 12px 20px 12px;
  overflow-y: auto;
  background-color: ${({ theme }) => theme.contentBackground};
`;

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedContent, setSelectedContent] = useState<string>('Party');

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  return (
    <ThemeProvider theme={isDarkMode ? darkTheme : lightTheme}>
      <ContentProvider>
        <Hotkeys>
          <AppContainer>
            <Header toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
            <SidebarContainer>
              <Sidebar selectedContent={selectedContent} onSelect={setSelectedContent} />
            </SidebarContainer>
            <MainContentContainer>
              <Content page={selectedContent} />
            </MainContentContainer>
          </AppContainer>
        </Hotkeys>
      </ContentProvider>
      <ToastContainer />
    </ThemeProvider>
  );
};

export default App;
