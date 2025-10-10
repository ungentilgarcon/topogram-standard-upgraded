import React, { useEffect } from 'react';
import { useSubscribe, useFind } from 'meteor/react-meteor-data';
import { Link } from 'react-router-dom';
import { Topograms } from '/imports/api/collections';

export default function Home() {
  console.debug && console.debug('Home component rendered');

  // subscribe to all topograms for local/migration view
  const isReady = useSubscribe('allTopograms');
  const tops = useFind(() => Topograms.find({}, { sort: { createdAt: -1 }, limit: 200 }));

  useEffect(() => {
    console.debug && console.debug('Home mounted - subscribe ready?', isReady && isReady());
  }, []);

  useEffect(() => {
    try {
      console.debug && console.debug('Home subscription ready:', isReady && isReady(), 'tops.length:', tops && tops.length);
    } catch (e) {}
  }, [isReady && isReady(), tops && tops.length]);

  // Always render to show debug info
  // if (!isReady()) return <div>Loading topograms…</div>;
  return (
    <div style={{ padding: 12 }}>
      <h1>Topogram Standard (Meteor 3)</h1>
      <p>Connected to: local Meteor Mongo</p>
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <strong>Subscription ready:</strong> {String(isReady())} — <strong>count:</strong> {tops.length}
      </div>
      {tops.length === 0 ? (
        <div>
          <p>No topograms found.</p>
          <details>
            <summary>Debug: first 5 docs</summary>
            <pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(tops.slice(0, 5), null, 2)}</pre>
          </details>
        </div>
      ) : (
        <ul>
          {tops.map(t => (
            <li key={t._id}>
              <Link to={`/t/${t._id}`}>{t.title || t.name || t._id}</Link>
              {t.description ? (<div style={{ fontSize: 12, color: '#555' }}>{t.description}</div>) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
