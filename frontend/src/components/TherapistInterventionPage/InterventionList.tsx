import { ListGroup, Badge } from 'react-bootstrap';
import { getBadgeVariantFromUrl, getMediaTypeLabelFromUrl } from '../../utils/interventions';

const InterventionList = ({ items, onClick, t, tagColors }) => (
  <ListGroup className="shadow-sm w-100 mt-4">
    {items.map((rec) => (
      <ListGroup.Item
        key={rec._id}
        action
        onClick={() => onClick(rec)}
        className="d-flex justify-content-between align-items-center flex-wrap"
      >
        <div className="d-flex flex-column">
          <strong>{rec.title}</strong>
          <div className="text-muted">{t(rec.content_type)}</div>
          {rec.tags?.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-1">
              {rec.tags.map((tag) => (
                <Badge
                  key={tag}
                  bg=""
                  style={{ backgroundColor: tagColors[tag] || 'gray', color: '#fff' }}
                >
                  {t(tag)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <Badge bg={getBadgeVariantFromUrl(rec.media_url, rec.link)}>
            {t(getMediaTypeLabelFromUrl(rec.media_url, rec.link))}
          </Badge>
        </div>
      </ListGroup.Item>
    ))}
  </ListGroup>
);

export default InterventionList;
