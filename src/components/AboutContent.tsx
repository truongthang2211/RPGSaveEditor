import React from 'react';
import styled from 'styled-components';
import buyMeACoffeeImg from '../assets/Buy-me-a-coffee.png'; // Cập nhật đường dẫn tùy theo cấu trúc thư mục của bạn
import paypalImg from '../assets/paypal.png'; // Thay đổi nếu bạn có ảnh PayPal

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


const About: React.FC = () => {
  return (
    <AboutContainer>
      <AboutHeader>About This App</AboutHeader>
      <p>This application is designed to help you modify and manage RPG save files effectively.</p>
      <p>Version: 1.0.0</p>
      <p>Check out the source code on <Link href="https://github.com/truongthang2211/RPGSaveEditor" target="_blank" rel="noopener noreferrer">GitHub</Link>.</p>
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
