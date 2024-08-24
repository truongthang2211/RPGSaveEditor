// src/components/StyledText.tsx

import React from 'react';
import { convertText } from '../utils/textUtils';

interface StyledTextProps {
  text: string;
}

const StyledText: React.FC<StyledTextProps> = ({ text }) => {
  const parsedText = convertText(text);

  return (
    <div>
      {parsedText.map((part, index) => (
        part.text === '\n' ? (
          <br key={index} />
        ) : (
          <span key={index} style={{ color: part.color }}>
            {part.text}
          </span>
        )
      ))}
    </div>
  );
};

export default StyledText;
