import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';

import apiClient from '@/api/client';
import { extractApiError } from '@/stores/rehabTableStore';
import { toLocalYMD } from '@/utils/dateFormat';

import QuestionnairePanel from '@/components/RehaTablePage/QuestionnairePanel';
import QuestionnaireScheduleModal from '@/components/RehaTablePage/QuestionnaireScheduleModal';
import QuestionnaireBuilderModal from '@/components/RehaTablePage/QuestionnaireBuilderModal';

type QItem = {
  _id: string;
  key: string;
  title: string;
  description?: string;
  tags?: string[];
  question_count?: number;
  created_by?: string | null;
  created_by_name?: string;
  questions?: Array<{
    questionKey: string;
    answerType: string;
    translations?: Array<{ language: string; text: string }>;
    possibleAnswers?: Array<{
      key: string;
      translations?: Array<{ language: string; text: string }>;
    }>;
  }>;
};

type QAssigned = {
  _id: string;
  title: string;
  description?: string;
  frequency?: string;
  dates?: string[];
  schedule?: {
    interval?: number;
    unit?: 'day' | 'week' | 'month';
    selectedDays?: string[];
    startTime?: string;
    end?: {
      type?: 'never' | 'date' | 'count';
      date?: string | null;
      count?: number | null;
    };
  };
  question_count?: number;
  questions?: Array<{
    questionKey: string;
    answerType: string;
    translations?: Array<{ language: string; text: string }>;
    possibleAnswers?: Array<{
      key: string;
      translations?: Array<{ language: string; text: string }>;
    }>;
  }>;
  answered_entries?: Array<{
    questionKey: string;
    questionTranslations?: Array<{ language: string; text: string }>;
    answerType?: string;
    answers?: Array<{
      key: string;
      translations?: Array<{ language: string; text: string }>;
    }>;
    comment?: string;
    audio_url?: string | null;
    media_urls?: string[];
    answered_at?: string | null;
  }>;
};

interface QuestionnairesContentProps {
  patientId: string;
}

const QuestionnairesContent: React.FC<QuestionnairesContentProps> = ({ patientId }) => {
  const { t } = useTranslation();

  const [questionnaires, setQuestionnaires] = useState<QItem[]>([]);
  const [assignedQuestionnaires, setAssignedQuestionnaires] = useState<QAssigned[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [qModalOpen, setQModalOpen] = useState(false);
  const [qBuilderOpen, setQBuilderOpen] = useState(false);
  const [qMode, setQMode] = useState<'create' | 'modify'>('create');
  const [selectedQ, setSelectedQ] = useState<QItem | null>(null);
  const [qDefaults, setQDefaults] = useState<any>(null);

  const fetchQuestionnaires = useCallback(async () => {
    try {
      const res = await apiClient.get('/questionnaires/health/');
      const items: QItem[] = (Array.isArray(res.data) ? res.data : []).map((q: any) => ({
        _id: String(q._id),
        key: String(q.key),
        title: String(q.title),
        description: String(q.description || ''),
        tags: Array.isArray(q.tags) ? q.tags : [],
        question_count: Number(q.question_count || 0),
        created_by: q.created_by ? String(q.created_by) : null,
        created_by_name: String(q.created_by_name || ''),
        questions: Array.isArray(q.questions) ? q.questions : [],
      }));
      setQuestionnaires(items);
    } catch (e) {
      setQuestionnaires([]);
      setError(extractApiError(e, String(t('Failed to load questionnaires.'))));
    }
  }, [t]);

  const fetchAssignedQuestionnaires = useCallback(async () => {
    if (!patientId) return;

    try {
      const res = await apiClient.get(`/questionnaires/patient/${patientId}/`);
      const arr = Array.isArray(res.data) ? res.data : [];
      setAssignedQuestionnaires(arr as QAssigned[]);
    } catch (e) {
      setAssignedQuestionnaires([]);
      setError(extractApiError(e, String(t('Failed to load patient questionnaires.'))));
    }
  }, [patientId, t]);

  const openAddQ = useCallback((q: QItem) => {
    setQMode('create');
    setSelectedQ({ _id: q._id, key: q.key, title: q.title });
    setQDefaults({
      interval: 1,
      unit: 'month',
      selectedDays: [],
      end: { type: 'never' },
      startTime: '08:00',
    });
    setQModalOpen(true);
  }, []);

  const openModifyQ = useCallback(
    (q: QItem) => {
      const assigned = assignedQuestionnaires.find((a) => a._id === q._id);
      setQMode('modify');
      setSelectedQ({ _id: q._id, key: q.key, title: q.title });
      setQDefaults({
        effectiveFrom: toLocalYMD(new Date()),
        interval: assigned?.schedule?.interval ?? 1,
        unit: assigned?.schedule?.unit ?? 'month',
        selectedDays: assigned?.schedule?.selectedDays ?? [],
        startTime: assigned?.schedule?.startTime ?? '08:00',
        end: assigned?.schedule?.end ?? { type: 'never' },
      });
      setQModalOpen(true);
    },
    [assignedQuestionnaires]
  );

  const removeQ = useCallback(
    async (qid: string) => {
      if (!patientId) return;

      try {
        await apiClient.post('/questionnaires/remove/', {
          patientId,
          dynamicKey: qid,
          questionnaireId: qid,
        });
        await fetchAssignedQuestionnaires();
      } catch (e) {
        setError(extractApiError(e, String(t('Failed to remove questionnaire.'))));
      }
    },
    [fetchAssignedQuestionnaires, patientId, t]
  );

  useEffect(() => {
    if (!patientId) return;
    fetchQuestionnaires();
    fetchAssignedQuestionnaires();
  }, [fetchAssignedQuestionnaires, fetchQuestionnaires, patientId]);

  return (
    <div>
      {error && (
        <Alert
          variant="destructive"
          onClose={() => setError(null)}
          closeLabel={t('Close alert')}
          className="my-3"
        >
          {error}
        </Alert>
      )}

      <QuestionnairePanel
        data={{ questionnaires, assignedQuestionnaires }}
        actions={{
          openAddQ,
          openModifyQ,
          removeQ,
          openBuilder: () => setQBuilderOpen(true),
        }}
        t={t as any}
      />

      <QuestionnaireScheduleModal
        show={qModalOpen}
        mode={qMode}
        onHide={() => setQModalOpen(false)}
        onSuccess={async () => {
          setQModalOpen(false);
          await fetchAssignedQuestionnaires();
        }}
        patientId={patientId}
        questionnaire={selectedQ}
        defaults={qDefaults}
      />

      <QuestionnaireBuilderModal
        show={qBuilderOpen}
        onHide={() => setQBuilderOpen(false)}
        onSuccess={async () => {
          await fetchQuestionnaires();
        }}
      />
    </div>
  );
};

export default QuestionnairesContent;
