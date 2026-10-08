import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import buyMeACoffeeImg from '../assets/Buy-me-a-coffee.png';
import paypalImg from '../assets/paypal.png';
import appIcon from '../../src-tauri/icons/icons8-edit-64.png';
import { getVersion } from '@tauri-apps/api/app';
import ExternalLink from './ExternalLink';
import { useContent } from '../context/ContentContext';
import { SAVE_FORMATS } from '../formats';
import { BUY_ME_A_COFFEE, PAYPAL } from './SupportPrompt';
import { checkForUpdate, errorMessage, getCheckOnStartup, installUpdate, setCheckOnStartup } from '../utils/updater';

const REPO = 'https://github.com/truongthang2211/RPGSaveEditor';

const LINKS: [string, string][] = [
  ['Source code', REPO],
  ['Release notes', `${REPO}/releases`],
  ['Report a bug', `${REPO}/issues`],
  ['License (Apache 2.0)', `${REPO}/blob/main/LICENSE`],
  ['App icon by Icons8', 'https://icons8.com/'],
];

const SHORTCUTS: [string[], string][] = [
  [['Ctrl', 'O'], 'Open a save file'],
  [['Ctrl', 'S'], 'Save changes to the file'],
  [['Ctrl', 'R'], 'Reload the file from disk (discards changes)'],
  [['Enter'], 'In a table: next row (Shift+Enter: previous); ↑ / ↓ too, except in number boxes'],
];

const AboutContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 760px;
  padding: 8px 8px 20px;
  font-size: 14px;
  color: ${({ theme }) => theme.color};
`;

const AppHeader = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const AppIcon = styled.img`
  width: 56px;
  height: 56px;
`;

const AppName = styled.h2`
  margin: 0;
  font-size: 22px;
  color: ${({ theme }) => theme.primaryColor};
`;

const VersionTag = styled.span`
  display: inline-block;
  margin-top: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  border: 1px solid ${({ theme }) => theme.borderColor};
`;

const Card = styled.section`
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.itemBackground};
  p {
    margin: 6px 0;
    line-height: 1.5;
  }
`;

const CardTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 15px;
`;

const FormatList = styled.ul`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 16px;
  margin: 8px 0;
  padding: 0;
  list-style: none;
  li:nth-child(even) {
    opacity: 0.7;
    font-family: Consolas, Menlo, monospace;
  }
`;

const Links = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
`;

const Link = styled(ExternalLink)`
  color: ${({ theme }) => theme.primaryColor};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
`;

const PrimaryButton = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  background-color: ${({ theme }) => theme.selectedBackground};
  color: ${({ theme }) => theme.selectedColor};
  cursor: pointer;
  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const CheckLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
`;

const StatusText = styled.p<{ $kind: 'ok' | 'info' | 'error' }>`
  color: ${({ $kind, theme }) => ($kind === 'error' ? '#d9534f' : $kind === 'ok' ? '#28a745' : theme.color)};
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 10px;
  margin: 10px 0 4px;
  border-radius: 5px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.hoverBackground};
  border: 1px solid ${({ theme }) => theme.borderColor};
`;

const ProgressBar = styled.div<{ $width: number }>`
  width: ${({ $width }) => $width}%;
  height: 100%;
  background-color: ${({ theme }) => theme.selectedBackground};
  transition: width 0.3s ease;
`;

const ProgressText = styled.div`
  font-size: 12px;
  opacity: 0.8;
`;

const Shortcuts = styled.table`
  border-collapse: collapse;
  td {
    padding: 3px 16px 3px 0;
  }
`;

const Kbd = styled.kbd`
  padding: 1px 6px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: 4px;
  font-size: 12px;
`;

const Notice = styled(Card)`
  background-color: ${({ theme }) => theme.changedBackground};
  border-color: ${({ theme }) => theme.changedBorder};
`;

const DonateContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
`;

/** Light backing so both logos (PayPal is dark blue) stay readable in dark mode. */
const DonateLink = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  height: 52px;
  padding: 0 10px;
  border-radius: 8px;
  background-color: #fff;
  border: 1px solid ${({ theme }) => theme.borderColor};
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primaryColor};
    outline-offset: 2px;
  }
`;

const DonateImage = styled.img`
  height: 40px;
`;

type UpdateStatus = 'checking' | 'downloading' | 'installing' | null;
type StatusMessage = { kind: 'ok' | 'info' | 'error'; text: string } | null;

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);

const About: React.FC = () => {
  const { content } = useContent();
  const [checkOnStartup, setCheckOnStartupState] = useState(getCheckOnStartup);
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(null);
  const [message, setMessage] = useState<StatusMessage>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  const checkForUpdates = async () => {
    try {
      setUpdateStatus('checking');
      setMessage(null);
      setDownloadProgress(null);

      const update = await checkForUpdate();
      if (!update) {
        setUpdateStatus(null);
        setMessage({ kind: 'ok', text: `✓ You're on the latest version (checked at ${new Date().toLocaleTimeString()}).` });
        return;
      }

      setUpdateStatus(null);
      setMessage({ kind: 'info', text: `Version ${update.version} is available.` });
      await installUpdate(update, content.dirty, {
        onProgress: (downloaded, total) => {
          setUpdateStatus('downloading');
          setDownloadProgress({ downloaded, total });
        },
        onInstalling: () => setUpdateStatus('installing'),
      });
    } catch (error) {
      console.error('Update error:', error);
      setMessage({ kind: 'error', text: `Couldn't check for updates: ${errorMessage(error) || 'unknown error'}` });
      setUpdateStatus(null);
      setDownloadProgress(null);
    }
  };

  const percent = downloadProgress?.total ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100) : 0;

  return (
    <AboutContainer>
      <AppHeader>
        <AppIcon src={appIcon} alt="" />
        <div>
          <AppName>RPG Save Editor</AppName>
          <VersionTag>{version ? `Version ${version}` : 'Version …'}</VersionTag>
        </div>
      </AppHeader>

      <Card aria-labelledby="about-app">
        <CardTitle id="about-app">About</CardTitle>
        <p>Edit gold, items, characters, switches, variables and any other value in RPG Maker save files:</p>
        <FormatList aria-label="Supported formats">
          {SAVE_FORMATS.map((format) => (
            <React.Fragment key={format.id}>
              <li>{format.label}</li>
              <li>{format.extensions.map((ext) => `.${ext}`).join(', ')}</li>
            </React.Fragment>
          ))}
        </FormatList>
        <Links>
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </Links>
      </Card>

      <Card aria-labelledby="about-updates">
        <CardTitle id="about-updates">Updates</CardTitle>
        <Row>
          <PrimaryButton onClick={checkForUpdates} disabled={updateStatus !== null}>
            {updateStatus === 'checking'
              ? 'Checking for updates…'
              : updateStatus === 'downloading'
                ? 'Downloading update…'
                : updateStatus === 'installing'
                  ? 'Installing update…'
                  : 'Check for Updates'}
          </PrimaryButton>
          <CheckLabel>
            <input
              type="checkbox"
              checked={checkOnStartup}
              onChange={(e) => {
                setCheckOnStartup(e.target.checked);
                setCheckOnStartupState(e.target.checked);
              }}
            />
            Check for updates when the app starts
          </CheckLabel>
        </Row>
        {message && (
          <StatusText $kind={message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </StatusText>
        )}
        {downloadProgress && (
          <>
            <ProgressBarContainer role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <ProgressBar $width={percent} />
            </ProgressBarContainer>
            <ProgressText>
              {megabytes(downloadProgress.downloaded)} MB of {megabytes(downloadProgress.total)} MB ({percent}%)
            </ProgressText>
          </>
        )}
      </Card>

      <Card aria-labelledby="about-shortcuts">
        <CardTitle id="about-shortcuts">Keyboard shortcuts</CardTitle>
        <Shortcuts>
          <tbody>
            {SHORTCUTS.map(([keys, action]) => (
              <tr key={action}>
                <td>
                  {keys.map((key, i) => (
                    <React.Fragment key={key}>
                      {i > 0 && '+'}
                      <Kbd>{key}</Kbd>
                    </React.Fragment>
                  ))}
                </td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </Shortcuts>
      </Card>

      <Notice as="section" aria-labelledby="about-notice">
        <CardTitle id="about-notice">Before you edit</CardTitle>
        <p>Keep a backup of your save files: a wrong value can break a save or crash the game.</p>
        <p>
          This is an unofficial, fan-made tool. It is not affiliated with or endorsed by the makers of RPG Maker. RPG
          Maker is a trademark of its respective owners.
        </p>
      </Notice>

      <Card aria-labelledby="about-support">
        <CardTitle id="about-support">Support the project</CardTitle>
        <p>If you find this app useful and want to support its development:</p>
        <DonateContainer>
          <DonateLink href={BUY_ME_A_COFFEE} aria-label="Buy Me a Coffee">
            <DonateImage src={buyMeACoffeeImg} alt="Buy Me a Coffee" />
          </DonateLink>
          <DonateLink href={PAYPAL} aria-label="Donate via PayPal">
            <DonateImage src={paypalImg} alt="Donate via PayPal" />
          </DonateLink>
        </DonateContainer>
      </Card>
    </AboutContainer>
  );
};

export default About;
