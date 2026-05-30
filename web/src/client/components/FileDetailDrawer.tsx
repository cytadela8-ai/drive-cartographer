import type { DirectoryChild } from "../../server/explorer";

type FileDetailDrawerProps = {
  locations: DirectoryChild[];
  onClose: () => void;
  open: boolean;
};

export function FileDetailDrawer({ locations, onClose, open }: FileDetailDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <aside className="drawer" aria-label="File locations">
      <button className="icon-button" onClick={onClose} type="button">
        Close
      </button>
      <h2>Locations</h2>
      <ul className="location-list">
        {locations.map((location) => (
          <li key={`${location.scanId}:${location.relativePath}`}>
            <span>{location.absolutePath}</span>
            <span className={`presence ${location.presence}`}>{location.presence}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
