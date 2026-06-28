import React from 'react';
import { Card, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CirclePlusFill from '@/assets/icons/circle-plus-fill.svg?react';

interface QuestionnaireAvailableCardProps {
  q: {
    title: string;
    question_count?: number;
    created_by_name?: string;
  };
  isAssigned: boolean;
  onOpen: () => void;
  onAssign: () => void;
  t: (key: string) => string;
}

const QuestionnaireAvailableCard: React.FC<QuestionnaireAvailableCardProps> = ({
  q,
  isAssigned,
  onOpen,
  onAssign,
  t,
}) => (
  <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onOpen}>
    <CardHeader>
      <CardTitle>{q.title}</CardTitle>
      <CardDescription>
        {(q.created_by_name || q.question_count != null) && (
          <span>
            {q.created_by_name}
            {q.created_by_name && q.question_count != null && ' · '}
            {q.question_count != null && `${q.question_count} ${t('Questions')}`}
          </span>
        )}
      </CardDescription>
      <CardAction onClick={(e) => e.stopPropagation()}>
        {isAssigned ? (
          <div className="flex gap-1 items-center text-ok">
            {t('Assigned')}
            <CircleCheckFill className="w-5 h-5" />
          </div>
        ) : (
          <Button variant="ghost" onClick={onAssign} className="p-0 gap-1">
            <span className="text-base font-normal">{t('Assign')}</span>
            <CirclePlusFill className="w-5 h-5" />
          </Button>
        )}
      </CardAction>
    </CardHeader>
  </Card>
);

export default QuestionnaireAvailableCard;
