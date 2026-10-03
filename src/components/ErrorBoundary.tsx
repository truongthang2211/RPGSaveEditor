import React, { ErrorInfo, ReactNode } from 'react';
import styled from 'styled-components';

const Panel = styled.div`
  margin: 24px auto;
  max-width: 640px;
  padding: 16px 20px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.itemBackground};
`;

const Title = styled.h3`
  margin: 0 0 8px;
`;

const Details = styled.pre`
  margin: 12px 0;
  padding: 8px;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  background-color: ${({ theme }) => theme.inputBackground};
  color: ${({ theme }) => theme.inputTextColor};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const RetryButton = styled.button`
  padding: 6px 14px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.primaryColor};
  color: #fff;
  cursor: pointer;
`;

interface Props {
  children: ReactNode;
  /** The error is cleared when any of these change (e.g. page or open file). */
  resetKeys: readonly unknown[];
}

interface State {
  error: Error | null;
}

/**
 * Keeps a rendering error in one page from blanking the whole app: the page
 * shows the error and the header/sidebar (open, save, reload) keep working.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    const changed =
      prevProps.resetKeys.length !== this.props.resetKeys.length ||
      prevProps.resetKeys.some((key, i) => !Object.is(key, this.props.resetKeys[i]));
    if (this.state.error && changed) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Panel role="alert">
        <Title>This page could not be displayed</Title>
        <div>
          The save may contain data this page doesn't understand. Other pages, saving and
          reloading still work.
        </div>
        <Details>{error.message || String(error)}</Details>
        <RetryButton onClick={() => this.setState({ error: null })}>Try again</RetryButton>
      </Panel>
    );
  }
}

export default ErrorBoundary;
