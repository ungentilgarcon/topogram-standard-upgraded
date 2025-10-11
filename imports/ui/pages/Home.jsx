import React, { useEffect, useState } from 'react';
import { useSubscribe, useFind, useTracker } from 'meteor/react-meteor-data';
import { Meteor } from 'meteor/meteor'
// Ensure client accounts functions like Meteor.loginWithPassword are registered
import 'meteor/accounts-password'
import { Link } from 'react-router-dom';
import { Topograms } from '/imports/api/collections';
import ImportCsvModal from '/imports/ui/components/ImportCsvModal'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'

export default function Home() {
  console.debug && console.debug('Home component rendered');

  // subscribe to all topograms for local/migration view
  const isReady = useSubscribe('allTopograms');
  const tops = useFind(() => Topograms.find({}, { sort: { createdAt: -1 }, limit: 200 }));
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const { userId, user } = useTracker(() => {
    // Guard in case Meteor.userId/user are not available as functions in this runtime
    let uid = null
    let u = null
    try {
      uid = (typeof Meteor.userId === 'function') ? Meteor.userId() : (Meteor.userId ?? null)
    } catch (e) {
      uid = null
    }
    try {
      u = (typeof Meteor.user === 'function') ? Meteor.user() : (Meteor.user ?? null)
    } catch (e) {
      u = null
    }
    return { userId: uid, user: u }
  })

  const doLogin = () => {
    Meteor.loginWithPassword(loginEmail, loginPassword, (err) => {
      if (err) return alert('Login failed: ' + err.message)
      setLoginOpen(false)
      setLoginEmail('')
      setLoginPassword('')
    })
  }

  const doLogout = () => {
    Meteor.logout((err) => { if (err) console.warn('logout failed', err); })
  }

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
      <div style={{ marginTop: 8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>Subscription ready:</strong> {String(isReady())} — <strong>count:</strong> {tops.length}
        <button onClick={() => setImportModalOpen(true)} style={{ padding: '6px 10px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 4 }}>Import CSV</button>
        { userId ? (
          <Button onClick={doLogout} variant="outlined" color="inherit" size="small">Logout{user && user.username ? ` (${user.username})` : ''}</Button>
        ) : (
          <Button onClick={() => setLoginOpen(true)} variant="outlined" color="inherit" size="small">Login</Button>
        ) }
      </div>
      <Dialog open={loginOpen} onClose={() => setLoginOpen(false)}>
        <DialogTitle>Sign in</DialogTitle>
        <DialogContent>
          <TextField label="Email or username" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} fullWidth sx={{ mt: 1 }} />
          <TextField label="Password" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} fullWidth sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoginOpen(false)}>Cancel</Button>
          <Button onClick={doLogin} variant="contained">Login</Button>
        </DialogActions>
      </Dialog>
      <ImportCsvModal open={importModalOpen} onClose={() => setImportModalOpen(false)} onEnqueue={(jobId) => { console.info('CSV import job enqueued', jobId) }} />
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
