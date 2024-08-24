import React, { useEffect, useState } from 'react';
import { useContent } from '../context/ContentContext';
import _ from 'lodash';
import {
  Label,
  Input,
  Container,
  CharacterContainer,
  CharacterHeader,
  BonusList,
  BonusItem,
  BonusInput,
  StatsContainer,
  StatItem,
  StatLabel,
  GoldContainer,
  BonusLabel
} from '../styles/PartyContentStyles';

const PartyContent: React.FC = () => {
  const { content, setContent } = useContent();
  const [gold, setGold] = useState<number>(content.saveData?.party?._gold ?? 0);
  const [expandedCharacter, setExpandedCharacter] = useState<number | null>(null);

  useEffect(() => {
    setGold(content.saveData?.party?._gold ?? 0);
  }, [content]);

  const handleGoldChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newGold = Number(event.target.value);
    setGold(newGold);
    setContent((prevData: any) =>
      _.set({ ...prevData }, 'saveData.party._gold', newGold)
    );
  };

  const handleCharacterClick = (index: number) => {
    setExpandedCharacter(expandedCharacter === index ? null : index);
  };

  const handleBonusChange = (characterIndex: number, bonusIndex: number, value: number) => {
    setContent((prevData: any) => {
      const updatedContent = _.cloneDeep(prevData);
      const bonuses = updatedContent.saveData.actors._data['@a'][characterIndex + 1]._paramPlus['@a'];
      bonuses[bonusIndex] = value;
      return updatedContent;
    });
  };

  const handleStatChange = (characterIndex: number, statName: string, value: number) => {
    setContent((prevData: any) => {
      const updatedContent = _.cloneDeep(prevData);
  
      // Tách thuộc tính động và thuộc tính thông thường
      const keys = statName.split(/[\.\[\]\'\"]/).filter(Boolean);
      let target = updatedContent.saveData.actors._data['@a'][characterIndex + 1];
  
      // Duyệt qua các cấp của thuộc tính
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
  
      // Cập nhật giá trị thuộc tính cuối cùng
      target[keys[keys.length - 1]] = value;
  
      return updatedContent;
    });
  };
  

  const renderBonus = (bonus: number[], characterIndex: number) => (
    bonus.map((b, i) => (
      <BonusItem key={i}>
        <BonusLabel>Bonus {['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'][i]}:</BonusLabel>
        <BonusInput
          type="number"
          value={b}
          onChange={(e) => handleBonusChange(characterIndex, i, Number(e.target.value))}
        />
      </BonusItem>
    ))
  );

  const characters = content.saveData?.actors?._data?.['@a'].filter((e: any) => e != null) || [];

  return (
    <Container>
      <GoldContainer>
        <Label htmlFor="gold">Gold</Label>
        <Input
          id="gold"
          type="number"
          value={gold}
          onChange={handleGoldChange}
        />
      </GoldContainer>
      {characters.map((character: any, index: number) => (
        <CharacterContainer key={index}>
          <CharacterHeader onClick={() => handleCharacterClick(index)}>
            {character._name || `Character ${index + 1}`}
            {expandedCharacter === index ? '▲' : '▼'}
          </CharacterHeader>
          {expandedCharacter === index && (
            <>
              <BonusList>
                {renderBonus(character._paramPlus['@a'] || [], index)}
              </BonusList>
              <StatsContainer>
                <StatItem>
                  <StatLabel htmlFor={`hp-${index}`}>HP:</StatLabel>
                  <BonusInput
                    id={`hp-${index}`}
                    type="number"
                    value={character._hp || ''}
                    onChange={(e) => handleStatChange(index, '_hp', Number(e.target.value))}
                  />
                </StatItem>
                <StatItem>
                  <StatLabel htmlFor={`mp-${index}`}>MP:</StatLabel>
                  <BonusInput
                    id={`mp-${index}`}
                    type="number"
                    value={character._mp || ''}
                    onChange={(e) => handleStatChange(index, '_mp', Number(e.target.value))}
                  />
                </StatItem>
                {character._tp ? (<StatItem>
                  <StatLabel htmlFor={`tp-${index}`}>TP:</StatLabel>
                  <BonusInput
                    id={`tp-${index}`}
                    type="number"
                    value={character._tp}
                    onChange={(e) => handleStatChange(index, '_tp', Number(e.target.value))}
                  />
                </StatItem>) : null}
                {character._level ? (<StatItem>
                  <StatLabel htmlFor={`level-${index}`}>Level:</StatLabel>
                  <BonusInput
                    id={`level-${index}`}
                    type="number"
                    value={character._level}
                    onChange={(e) => handleStatChange(index, '_level', Number(e.target.value))}
                  />
                </StatItem>) : null}
                {character._exp["1"] ? (<StatItem>
                  <StatLabel htmlFor={`exp-${index}`}>Exp:</StatLabel>
                  <BonusInput
                    id={`exp-${index}`}
                    type="number"
                    value={character._exp["1"]}
                    onChange={(e) => handleStatChange(index, '_exp["1"]', Number(e.target.value))}
                  />
                </StatItem>) : null}
              </StatsContainer>
            </>
          )}
        </CharacterContainer>
      ))}
    </Container>
  );
};

export default PartyContent;
