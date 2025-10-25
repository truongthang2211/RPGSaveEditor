import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import buyMeACoffeeImg from '../assets/Buy-me-a-coffee.png';
import paypalImg from '../assets/paypal.png';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

const AboutContainer = styled.div`
  padding: 20px;
  font-size: 16px;
`;

const AboutHeader = styled.h2`
  margin-top: 0;
  color: ${({ theme }) => theme.primaryColor};
`;

const Link = styled.a`
  color: ${({ theme }) => theme.primaryColor};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const UpdateButton = styled.button`
  background-color: ${({ theme }) => theme.primaryColor};
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  margin-top: 10px;
  &:hover {
    opacity: 0.9;
  }
  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;

const DonateImage = styled.img`
  width: 200px;
  margin-right: 10px;
  vertical-align: middle;
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    transform: scale(1.1) rotate(5deg); /* Tạo hiệu ứng rung khi hover */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
`;

const DonateContainer = styled.div`
  display: flex;
  align-items: center;
  margin-top: 10px;
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 20px;
  background-color: #f0f0f0;
  border-radius: 10px;
  margin: 10px 0;
  overflow: hidden;
`;

const ProgressBar = styled.div<{ width: number }>`
  width: ${props => props.width}%;
  height: 100%;
  background-color: ${({ theme }) => theme.primaryColor};
  transition: width 0.3s ease;
`;

const ProgressText = styled.p`
  margin: 5px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.textColor};
`;


const About: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<'checking' | 'available' | 'not-available' | 'downloading' | 'installing' | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  const checkForUpdates = async () => {
    try {
      setUpdateStatus('checking');
      setUpdateError(null);
      setDownloadProgress(null);
      
      const update = await check();
      
      if (update) {
        setUpdateStatus('available');
        const confirmed = await window.confirm(
          `A new version ${update.version} is available!\n\n${
            update.body || 'No release notes available.'
          }\n\nWould you like to install it now?`
        );
        
        if (confirmed) {
          setUpdateStatus('downloading');
          let downloaded = 0;
          
          // Download and install the update with progress tracking
          let total = 0;
          await update.downloadAndInstall((event) => {
            if (event.event === 'Started') {
              total = event.data?.contentLength || 0;
              setDownloadProgress({ downloaded: 0, total });
            }
            else if (event.event === 'Progress') {
              downloaded += event.data.chunkLength;
              setDownloadProgress({ 
                downloaded, 
                total: total || downloaded // Use the total from Started event or fallback to downloaded
              });
            }
            else if (event.event === 'Finished') {
              setUpdateStatus('installing');
            }
          });

          // Relaunch the application
          setUpdateStatus('installing');
          await relaunch();
        }
      } else {
        setUpdateStatus('not-available');
        window.alert('You are running the latest version!');
      }
    } catch (error) {
      console.error('Update error:', error);
      setUpdateError(error instanceof Error ? error.message : 'Failed to check for updates');
      setUpdateStatus(null);
      setDownloadProgress(null);
    }
  };

  return (
    <AboutContainer>
      <AboutHeader>About This App</AboutHeader>
      <p>This application is designed to help you modify and manage RPG save files effectively.</p>
      <p>Version: {version}</p>
      <p>Check out the source code on <Link href="https://github.com/truongthang2211/RPGSaveEditor" target="_blank" rel="noopener noreferrer">GitHub</Link>.</p>
      
      <UpdateButton 
        onClick={checkForUpdates}
        disabled={updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing'}
      >
        {updateStatus === 'checking' ? 'Checking for updates...' :
         updateStatus === 'downloading' ? 'Downloading update...' :
         updateStatus === 'installing' ? 'Installing update...' :
         'Check for Updates'}
      </UpdateButton>
      {updateError && <p style={{ color: 'red' }}>{updateError}</p>}
      
      {downloadProgress && (
        <>
          <ProgressBarContainer>
            <ProgressBar width={(downloadProgress.downloaded / downloadProgress.total) * 100} />
          </ProgressBarContainer>
          <ProgressText>
            Downloaded: {Math.round((downloadProgress.downloaded / 1024 / 1024) * 100) / 100} MB 
            of {Math.round((downloadProgress.total / 1024 / 1024) * 100) / 100} MB
            ({Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%)
          </ProgressText>
        </>
      )}
      
      <p>If you find this app useful and want to support its development, you can:</p>
      <DonateContainer>
        <a href="https://www.buymeacoffee.com/truongthang2211" target="_blank" rel="noopener noreferrer">
          <DonateImage src={buyMeACoffeeImg} alt="Buy Me a Coffee" />
        </a>
        <a href="https://www.paypal.me/truongthang2211" target="_blank" rel="noopener noreferrer">
          <DonateImage src={paypalImg} alt="Donate via PayPal" />
        </a>
      </DonateContainer>
      
    </AboutContainer>
  );
};

export default About;
