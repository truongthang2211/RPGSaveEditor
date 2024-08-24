import styled from 'styled-components';

// Styled components
export const GoldContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px; /* Khoảng cách giữa Label và Input */
`;

export const Label = styled.label`
  display: block;
  font-weight: 600;
  color: ${({ theme }) => theme.color};
  font-size: 14px;

`;

export const Input = styled.input`
  color: ${({ theme }) => theme.color};
  width: 100%;
  max-width: 300px; 
  padding: 6px 6px;
  font-size: 14px;
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: 8px;
  box-sizing: border-box;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  background-color: ${({ theme }) => theme.inputBackground};
  &:focus {
    border-color: ${({ theme }) => theme.primaryColor};
    box-shadow: 0 0 3px ${({ theme }) => theme.primaryColor};
    outline: none;
  }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background-color: ${({ theme }) => theme.contentBackground};
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
`;

export const CharacterContainer = styled.div`
  border: 1px solid ${({ theme }) => theme.borderColor};
  border-radius: 8px;
  background-color: ${({ theme }) => theme.sidebarBackground};
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

export const CharacterHeader = styled.div`
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.color};
  padding: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.borderColor};
  background-color: ${({ theme }) => theme.background};
  transition: background-color 0.3s ease;

  &:hover {
    background-color: ${({ theme }) => theme.hoverBackground};
  }
`;

export const BonusList = styled.div`
  display: flex;
  flex-wrap: wrap; /* Cho phép các item quấn quanh khi không đủ chỗ */
  gap: 4px; /* Khoảng cách giữa các item */
  padding: 12px; /* Padding để tránh item bị dính vào lề */
  background-color: ${({ theme }) => theme.contentBackground};
`;

export const BonusItem = styled.div`
  flex: 1 1 calc(50% - 12px); /* Mỗi item chiếm 50% chiều rộng của container, trừ khoảng cách */
  display: flex;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.color};
  gap: 8px; /* Khoảng cách giữa Label và Input */
`;

export const BonusLabel = styled.span`
  min-width: 90px; /* Chiều rộng cố định để căn chỉnh cột */
`;

export const BonusInput = styled(Input)`
  width: 120px;
  text-align: right;
`;



export const StatsContainer = styled.div`
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  background-color: ${({ theme }) => theme.contentBackground};
  border-top: 1px solid ${({ theme }) => theme.borderColor};
`;

export const StatItem = styled.div`
  flex: 1 1 calc(50% - 12px);
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px; /* Khoảng cách giữa Label và Input */
`;

export const StatLabel = styled(Label)`
  min-width: 90px; 
  font-size: 14px; /* Giảm kích thước font */
`;

