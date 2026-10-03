import React, { useState } from 'react';
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
import { useSaveEditor } from '../hooks/useSaveEditor';
import { ActorField, ActorView } from '../formats';

const BONUS_LABELS = ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];

/**
 * HP/MP are shown whenever the save has them; the others only when non-zero.
 * Stats missing from the save are hidden rather than added (some games' scripts
 * keep them elsewhere).
 */
const STATS: { field: ActorField; label: string; alwaysShown: boolean }[] = [
  { field: 'hp', label: 'HP', alwaysShown: true },
  { field: 'mp', label: 'MP', alwaysShown: true },
  { field: 'tp', label: 'TP', alwaysShown: false },
  { field: 'level', label: 'Level', alwaysShown: false },
  { field: 'exp', label: 'Exp', alwaysShown: false },
];

const PartyContent: React.FC = () => {
  const { editor, save, update } = useSaveEditor();
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  if (!editor || !save) return <Container />;

  const gold = editor.getGold(save);
  const actors = editor.getActors(save);

  const renderBonus = (actor: ActorView) =>
    actor.paramPlus.map((value, i) => (
      <BonusItem key={i}>
        <BonusLabel>Bonus {actor.paramLabels?.[i] ?? BONUS_LABELS[i]}:</BonusLabel>
        <BonusInput
          type="number"
          value={value}
          onChange={(e) => update((ed, s) => ed.setActorParamPlus(s, actor.slot, i, Number(e.target.value)))}
        />
      </BonusItem>
    ));

  const renderStats = (actor: ActorView) =>
    STATS.filter(({ field, alwaysShown }) => (alwaysShown ? actor[field] !== undefined : actor[field])).map(({ field, label }) => {
      const id = `${field}-${actor.slot}`;
      const range = actor.limits?.[field];
      return (
        <StatItem key={field}>
          <StatLabel htmlFor={id}>{actor.statLabels?.[field] ?? label}:</StatLabel>
          <BonusInput
            id={id}
            type="number"
            min={range?.min}
            max={range?.max}
            title={range ? `${range.min}–${range.max}` : undefined}
            value={actor[field] || ''}
            onChange={(e) => update((ed, s) => ed.setActorField(s, actor.slot, field, Number(e.target.value)))}
          />
        </StatItem>
      );
    });

  return (
    <Container>
      <GoldContainer>
        <Label htmlFor="gold">Gold</Label>
        <Input
          id="gold"
          type="number"
          value={gold}
          onChange={(e) => update((ed, s) => ed.setGold(s, Number(e.target.value)))}
        />
      </GoldContainer>
      {actors.map((actor, index) => (
        <CharacterContainer key={actor.slot}>
          <CharacterHeader onClick={() => setExpandedSlot(expandedSlot === actor.slot ? null : actor.slot)}>
            {actor.name || `Character ${index + 1}`}
            {expandedSlot === actor.slot ? '▲' : '▼'}
          </CharacterHeader>
          {expandedSlot === actor.slot && (
            <>
              <BonusList>{renderBonus(actor)}</BonusList>
              <StatsContainer>{renderStats(actor)}</StatsContainer>
            </>
          )}
        </CharacterContainer>
      ))}
    </Container>
  );
};

export default PartyContent;
