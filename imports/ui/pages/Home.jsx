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
import { Accounts } from 'meteor/accounts-base'

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
  const [exportOpen, setExportOpen] = useState(false)
  const [exportConfig, setExportConfig] = useState(null)
  const [signupOpen, setSignupOpen] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [signupPassword, setSignupPassword] = useState('')

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

  const doSignup = () => {
    // Create a new account on the client; server-side validations apply
    const options = {}
    if (signupEmail) options.email = signupEmail
    if (signupUsername) options.username = signupUsername
    options.password = signupPassword
    if (!options.password) return alert('Please choose a password')
    Accounts.createUser(options, (err) => {
      if (err) return alert('Signup failed: ' + err.message)
      setSignupOpen(false)
      setSignupEmail('')
      setSignupUsername('')
      setSignupPassword('')
      // After signup the user is logged in automatically
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
  const [expandedFolders, setExpandedFolders] = useState({})

  const toggleFolder = (name) => setExpandedFolders(prev => ({ ...prev, [name]: !prev[name] }))

  // Ensure `tops` is an array (useFind sometimes returns a cursor-like object)
  const topsList = Array.isArray(tops) ? tops : (tops && typeof tops.fetch === 'function' ? tops.fetch() : (tops || []))

  // group topograms by `folder` field so imported folders (eg. 'Debian') show first
  const folderMap = {}
  const noFolder = []
  topsList.forEach(t => {
    if (t && t.folder) {
      folderMap[t.folder] = folderMap[t.folder] || []
      folderMap[t.folder].push(t)
    } else {
      noFolder.push(t)
    }
  })

  // Auto-expand all folders present in folderMap so they show as folders on load
  useEffect(() => {
    const keys = Object.keys(folderMap || {})
    if (keys.length) {
      const expanded = {}
      keys.forEach(k => { expanded[k] = true })
      setExpandedFolders(expanded)
    }
  }, [topsList])

  // Debug panel toggle state - default true while investigating missing folders
  const [showDebug, setShowDebug] = useState(true)

  return (
    <div className="home-container">
      <h1 className="home-title">Topogram Standard (Meteor 3)</h1>
      <p className="home-sub">Connected to: local Meteor Mongo</p>
      <div className="controls-row">
          <div className="controls-left">
            <div className="ready-count"><strong>Subscription ready:</strong> {String(isReady())} <strong>count:</strong> {topsList.length}</div>
          <button onClick={() => setImportModalOpen(true)} className="import-button">Import CSV</button>
          <Button component="a" href="/builder" variant="outlined" size="small" sx={{ ml: 1 }}>Builder</Button>
        </div>
        <div className="controls-right">
          { userId ? (
            <Button onClick={doLogout} variant="outlined" color="inherit" size="small">Logout{user && user.username ? ` (${user.username})` : ''}</Button>
          ) : (
            <>
              <Button onClick={() => setLoginOpen(true)} variant="outlined" color="inherit" size="small">Sign in</Button>
            </>
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
          <Button onClick={doLogin} variant="contained">Sign in</Button>
          <Button onClick={() => { setLoginOpen(false); setSignupOpen(true); }} color="secondary">Sign up</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={signupOpen} onClose={() => setSignupOpen(false)}>
        <DialogTitle>Create an account</DialogTitle>
        <DialogContent>
          <TextField label="Email (optional)" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} fullWidth sx={{ mt: 1 }} />
          <TextField label="Username (optional)" value={signupUsername} onChange={e => setSignupUsername(e.target.value)} fullWidth sx={{ mt: 1 }} />
          <TextField label="Password" type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} fullWidth sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSignupOpen(false)}>Cancel</Button>
          <Button onClick={doSignup} variant="contained">Sign up</Button>
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
        <div>
          <ul className="topogram-list">
            {Object.keys(folderMap).map(folderName => (
              <li key={`folder-${folderName}`} className="topogram-item folder-item">
                <div className="folder-header" onClick={() => toggleFolder(folderName)} role="button" tabIndex={0} onKeyPress={() => toggleFolder(folderName)}>
                  <span className="folder-icon" aria-hidden>📁</span>
                  <div className="folder-meta">
                    <strong className="folder-name">{folderName}</strong>
                    <small className="folder-count">({folderMap[folderName].length} maps)</small>
                  </div>
                </div>
                {expandedFolders[folderName] ? (
                  <div className="folder-contents">
                    {folderMap[folderName].map(t => (
                      <div key={t._id} className="topogram-item folder-card">
                        <Link to={`/t/${t._id}`} className="topogram-link">{t.title || t.name || t._id}</Link>
                        {t.description ? (<div className="topogram-desc">{t.description}</div>) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
            {noFolder.map(t => (
              <li key={t._id} className="topogram-item">
                <Link to={`/t/${t._id}`} className="topogram-link">{t.title || t.name || t._id}</Link>
                {t.description ? (<div className="topogram-desc">{t.description}</div>) : null}
              </li>
            ))}
          </ul>

          {showDebug ? (
            <div className="folder-debug-panel">
              <div className="debug-header">
                <strong>Client Debug</strong>
                <button className="debug-hide" type="button" onClick={() => setShowDebug(false)}>Hide</button>
              </div>
              <div className="debug-body">
                <div><strong>Subscription ready:</strong> {String(isReady())}</div>
                <div><strong>topsList.length:</strong> {topsList.length}</div>
                <div><strong>Folders:</strong> {Object.keys(folderMap).join(', ') || '(none)'}</div>
              </div>
              <details className="debug-details">
                <summary>First 20 received topograms (client)</summary>
                <pre>{JSON.stringify(topsList.slice(0, 20), null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
