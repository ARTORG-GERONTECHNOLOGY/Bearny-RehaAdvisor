import React from 'react';
import { TFunction } from 'i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import CircleRemoveFill from '@/assets/icons/trash-x-fill.svg?react';
import EditFill from '@/assets/icons/pencil-fill.svg?react';

interface QuestionnaireAssignedCardProps {
  a: {
    title: string;
    question_count?: number;
    frequency?: string;
    dates?: string[];
    answered_entries?: unknown[];
  };
  onOpen: () => void;
  onModify: () => void;
  onRemove: () => void;
  t: TFunction;
}

const QuestionnaireAssignedCard: React.FC<QuestionnaireAssignedCardProps> = ({
  a,
  onOpen,
  onModify,
  onRemove,
  t,
}) => (
  <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onOpen}>
    <CardHeader>
      <CardTitle>{a.title}</CardTitle>
      <CardDescription>
        {a.question_count != null && `${a.question_count} ${t('Questions')}`}
      </CardDescription>
      <CardAction onClick={(e) => e.stopPropagation()} className="flex gap-2">
        <Button variant="ghost" onClick={onModify} className="p-0">
          <EditFill className="w-5 h-5" />
        </Button>
        <Button variant="ghost" onClick={onRemove} className="p-0">
          <CircleRemoveFill className="text-nok w-5 h-5" />
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent className="flex gap-1 flex-wrap">
      {a.frequency && <Badge>{a.frequency}</Badge>}
      {!!a.dates?.length && (
        <Badge>
          {t('Next on')} {new Date(a.dates[0]).toLocaleDateString()}
        </Badge>
      )}
      {!!a.answered_entries?.length && (
        <Badge>
          {a.answered_entries.length} {t('Answered')}
        </Badge>
      )}
    </CardContent>
  </Card>
);

export default QuestionnaireAssignedCard;
