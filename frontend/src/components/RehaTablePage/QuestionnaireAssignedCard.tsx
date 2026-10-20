import React from 'react';
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
import { formatLocaleDate } from '@/utils/dateFormat';

interface QuestionnaireAssignedCardProps {
  a: {
    title: string;
    question_count?: number;
    frequency?: string;
    due_since?: string | null;
    next_date?: string | null;
    answered_entries?: unknown[];
  };
  onOpen: () => void;
  onModify: () => void;
  onRemove: () => void;
  t: (key: string) => string;
}

// Backend sends Zurich calendar days; a time without zone is parsed as local, so no shift.
const formatDay = (ymd: string) => formatLocaleDate(`${ymd}T00:00`);

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
        <Button variant="ghost" onClick={onModify} className="p-0" aria-label="Edit questionnaire">
          <EditFill className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          onClick={onRemove}
          className="p-0"
          aria-label="Remove questionnaire"
        >
          <CircleRemoveFill className="text-nok w-5 h-5" />
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent className="flex gap-1 flex-wrap">
      {a.frequency && <Badge>{a.frequency}</Badge>}
      {a.due_since ? (
        <Badge>
          {t('Due since')} {formatDay(a.due_since)}
        </Badge>
      ) : (
        a.next_date && (
          <Badge>
            {t('Next on')} {formatDay(a.next_date)}
          </Badge>
        )
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
