import React, { useEffect, useState } from 'react';
import { useSubscribe, useFind, useTracker } from 'meteor/react-meteor-data';
import { Meteor } from 'meteor/meteor'
// Ensure client accounts functions like Meteor.loginWithPassword are registered
import 'meteor/accounts-password'
import { Link } from 'react-router-dom';
import { Topograms } from '/imports/api/collections';
import ImportCsvModal from '/imports/ui/components/ImportCsvModal'
import '/imports/ui/styles/greenTheme.css'
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
  const [isAdmin, setIsAdmin] = useState(false)

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

  useEffect(() => {
    // query server for admin status
    if (!userId) return setIsAdmin(false)
    Meteor.call('admin.isAdmin', (err, res) => {
      if (err) {
        console.debug && console.debug('admin.isAdmin call error', err)
        return setIsAdmin(false)
      }
      setIsAdmin(!!res)
    })
  }, [userId])

  // Always render to show debug info
  // if (!isReady()) return <div>Loading topograms…</div>;
  return (
    <div className="home-container">
      <h1 className="home-title">Topogram Standard (Meteor 3)</h1>
      <p className="home-sub">Connected to: local Meteor Mongo</p>
      <div className="controls-row">
          <div className="controls-left">
          <div className="ready-count"><strong>Subscription ready:</strong> {String(isReady())}   <strong>count:</strong> {tops.length}</div>
          <button onClick={() => setImportModalOpen(true)} className="import-button">Import CSV</button>
          <Button component="a" href="/builder" variant="outlined" size="small" sx={{ ml: 1 }}>Builder</Button>
        </div>
        <div className="controls-right">
          { userId ? (
            <Button onClick={doLogout} variant="outlined" color="inherit" size="small">Logout{user && user.username ? ` (${user.username})` : ''}</Button>
          ) : (
            <Button onClick={() => setLoginOpen(true)} variant="outlined" color="inherit" size="small">Login</Button>
          ) }
        </div>
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
        <ul className="topogram-list">
          {tops.map(t => (
            <li key={t._id} className="topogram-item">
              <Link to={`/t/${t._id}`} className="topogram-link">{t.title || t.name || t._id}</Link>
              {t.description ? (<div className="topogram-desc">{t.description}</div>) : null}
              {isAdmin ? (
                <div style={{ marginTop: 6 }}>
                  <Button variant="outlined" color="error" size="small" onClick={() => {
                    if (!confirm(`Delete topogram ${t._id}? This will remove nodes and edges.`)) return
                    Meteor.call('topogram.delete', { topogramId: t._id }, (err, r) => {
                      if (err) return alert('Delete failed: ' + err.message)
                      console.info('Deleted topogram', t._id, r)
                    })
                  }}>Delete</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
