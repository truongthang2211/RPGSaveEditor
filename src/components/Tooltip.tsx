import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import StyledText from "./StyledText";

// Tooltip Wrapper
const TooltipWrapper = styled.div`
  position: relative;
  display: inline-block;
`;

// Tooltip Text
interface TooltipTextProps {
  $show: boolean;
  $hasText: boolean;
  width: string;
  fontSize: string;
  $placement: "top" | "bottom" | "left" | "right";
}

const TooltipText = styled.div<TooltipTextProps>`
  visibility: ${({ $show: show }) => (show ? "visible" : "hidden")};
  background-color: #555;
  color: #fff;
  text-align: center;
  border-radius: 5px;
  padding: 5px;
  position: absolute;
  z-index: 2;
  width: ${({ $hasText: hasText, width }) => (hasText ? width : "10px")}; /* Adjust width based on text presence */
  max-width: 250px;
  opacity: ${({ $show: show }) => (show ? 1 : 0)};
  transition: opacity 0.3s ease-in-out;
  white-space: wrap;
  height: auto;
  font-size: ${({ fontSize }) => (fontSize ? fontSize : "inherit")};
  ${({ $placement: placement }) => {
    switch (placement) {
      case "top":
        return `
          bottom: 125%; /* Position above the tooltip trigger */
          left: 50%;
          transform: translateX(-50%);
          &::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border-width: 5px;
            border-style: solid;
            border-color: #555 transparent transparent transparent;
          }
        `;
      case "bottom":
        return `
          top: 125%; /* Position below the tooltip trigger */
          left: 50%;
          transform: translateX(-50%);
          &::after {
            content: "";
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border-width: 5px;
            border-style: solid;
            border-color: transparent transparent #555 transparent;
          }
        `;
      case "left":
        return `
          top: 50%;
          right: 125%; /* Position to the left of the tooltip trigger */
          transform: translateY(-50%);
          &::after {
            content: "";
            position: absolute;
            top: 50%;
            right: 100%;
            transform: translateY(-50%);
            border-width: 5px;
            border-style: solid;
            border-color: transparent #555 transparent transparent;
          }
        `;
      case "right":
      default:
        return `
          top: 50%;
          left: 125%; /* Position to the right of the tooltip trigger */
          transform: translateY(-50%);
          &::after {
            content: "";
            position: absolute;
            top: 50%;
            left: -10px;
            transform: translateY(-50%);
            border-width: 5px;
            border-style: solid;
            border-color: transparent #555 transparent transparent;
          }
        `;
    }
  }}
`;

interface TooltipProps {
  children: React.ReactNode;
  text?: string;
  width?: string;
  fontSize?: string;
  placement?: "top" | "bottom" | "left" | "right";
}

// Tooltip Component
const Tooltip: React.FC<TooltipProps> = ({
  children,
  text = "",
  width = "250%",
  placement = "right",
  fontSize = "inherit"
}) => {
  const [show, setShow] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    const id = setTimeout(() => setShow(true), 1000); // Show after 1 seconds
    setTimeoutId(id);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    setShow(false);
  }, [timeoutId]);

  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  const hasText = Boolean(text && text.trim());

  return (
    <TooltipWrapper
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      <TooltipText
        fontSize={fontSize}
        $show={show}
        $hasText={hasText}
        width={width}
        $placement={placement}
      >
        <StyledText text={text}></StyledText>
      </TooltipText>
    </TooltipWrapper>
  );
};

export default Tooltip;
