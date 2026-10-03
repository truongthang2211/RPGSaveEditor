import React, { useState } from 'react';
import styled from 'styled-components';
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

const Summary = styled.span`
  margin-left: 12px;
  font-size: 13px;
  font-weight: 400;
  opacity: 0.7;
`;

const Chevron = styled.span`
  float: right;
`;

/** "Lv 99 · HP 9000 · Slot 1": tells same-named characters apart while collapsed. */
function summaryOf(actor: ActorView): string {
  const parts: string[] = [];
  if (actor.level !== undefined) parts.push(`Lv ${actor.level}`);
  if (actor.hp !== undefined) parts.push(`HP ${actor.hp}`);
  parts.push(`Slot ${actor.slot}`);
  return parts.join(' · ');
}

const PartyContent: React.FC = () => {
  const { editor, save, origin, update } = useSaveEditor();
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  if (!editor || !save) return <Container />;

  const gold = editor.getGold(save);
  const originGold = origin ? editor.getGold(origin) : gold;
  const actors = editor.getActors(save);
  const originActors = new Map((origin ? editor.getActors(origin) : actors).map((a) => [a.slot, a]));

  const renderStats = (actor: ActorView, loaded?: ActorView) =>
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
            $changed={loaded !== undefined && actor[field] !== loaded[field]}
            onChange={(e) => update((ed, s) => ed.setActorField(s, actor.slot, field, Number(e.target.value)))}
          />
        </StatItem>
      );
    });

  const renderBonus = (actor: ActorView, loaded?: ActorView) =>
    actor.paramPlus.map((value, i) => {
      const id = `bonus-${actor.slot}-${i}`;
      return (
        <BonusItem key={i}>
          <BonusLabel as="label" htmlFor={id}>Bonus {actor.paramLabels?.[i] ?? BONUS_LABELS[i]}:</BonusLabel>
          <BonusInput
            id={id}
            type="number"
            value={value}
            $changed={loaded !== undefined && value !== loaded.paramPlus[i]}
            onChange={(e) => update((ed, s) => ed.setActorParamPlus(s, actor.slot, i, Number(e.target.value)))}
          />
        </BonusItem>
      );
    });

  const toggle = (slot: number) => setExpandedSlot(expandedSlot === slot ? null : slot);

  return (
    <Container>
      <GoldContainer>
        <Label htmlFor="gold">Gold</Label>
        <Input
          id="gold"
          type="number"
          value={gold}
          $changed={gold !== originGold}
          onChange={(e) => update((ed, s) => ed.setGold(s, Number(e.target.value)))}
        />
      </GoldContainer>
      {actors.map((actor, index) => {
        const expanded = expandedSlot === actor.slot;
        const loaded = originActors.get(actor.slot);
        return (
          <CharacterContainer key={actor.slot}>
            <CharacterHeader
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onClick={() => toggle(actor.slot)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(actor.slot);
                }
              }}
            >
              {actor.name || `Character ${index + 1}`}
              <Summary>{summaryOf(actor)}</Summary>
              <Chevron aria-hidden>{expanded ? '▲' : '▼'}</Chevron>
            </CharacterHeader>
            {expanded && (
              <>
                <StatsContainer>{renderStats(actor, loaded)}</StatsContainer>
                <BonusList>{renderBonus(actor, loaded)}</BonusList>
              </>
            )}
          </CharacterContainer>
        );
      })}
    </Container>
  );
};

export default PartyContent;
