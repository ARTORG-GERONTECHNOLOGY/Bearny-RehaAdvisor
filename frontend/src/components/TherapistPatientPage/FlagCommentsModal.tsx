// src/components/TherapistPatientPage/FlagCommentsModal.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import StandardModal from '@/components/common/StandardModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { TherapistPatientsStore } from '@/stores/therapistPatientsStore';
import { fmtDateTime } from '@/utils/patientStatus';

type Props = {
  store: TherapistPatientsStore;
};

const FlagCommentsModal: React.FC<Props> = observer(({ store }) => {
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void store.addComment(t);
  };

  return (
    <StandardModal
      show={store.showFlagCommentsModal}
      onHide={store.closeFlagComments}
      title={t('Comments')}
      description={store.flagCommentsPatientName || undefined}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Textarea
          value={store.newCommentText}
          onChange={(e) => store.setNewCommentText(e.currentTarget.value)}
          placeholder={String(t('e.g. Called patient, left voicemail.'))}
          disabled={store.commentSubmitting}
          maxLength={1000}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="dashboard"
            disabled={store.commentSubmitting || !store.newCommentText.trim()}
          >
            {store.commentSubmitting ? String(t('Adding...')) : String(t('Add comment'))}
          </Button>
        </div>
      </form>

      {store.commentsError && (
        <Alert variant="destructive" className="mt-3">
          {store.commentsError}
        </Alert>
      )}

      <div className="mt-4">
        <h6 className="text-sm font-semibold mb-2">{t('History')}</h6>

        {store.commentsLoading ? (
          <div className="text-center py-4">
            <Spinner />
          </div>
        ) : store.comments.length === 0 ? (
          <div className="text-muted-foreground text-sm">{t('No comments yet.')}</div>
        ) : (
          <ul className="flex flex-col gap-3 max-h-80 overflow-y-auto">
            {store.comments.map((c, idx) => (
              <li
                key={`${c.created_at ?? idx}-${c.commented_by}`}
                className="border-b border-border pb-2 last:border-b-0"
              >
                <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <span>{c.commented_by || t('Unknown')}</span>
                  <span>{fmtDateTime(c.created_at || undefined)}</span>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </StandardModal>
  );
});

export default FlagCommentsModal;
