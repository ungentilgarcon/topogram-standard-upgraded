import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSubscribe, useFind, useTracker } from 'meteor/react-meteor-data';
import { Meteor } from 'meteor/meteor'
// Ensure client accounts functions like Meteor.loginWithPassword are registered
import 'meteor/accounts-password'
import { Link } from 'react-router-dom';
import { Topograms } from '/imports/api/collections';
import ImportAllModal from '/imports/ui/components/ImportAllModal'
import '/imports/ui/styles/greenTheme.css'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AboutDialog from '/imports/ui/components/AboutDialog/AboutDialog.jsx'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Alert from '@mui/material/Alert'
import { Accounts } from 'meteor/accounts-base'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    if (typeof value._str === 'string') return value._str
    if (typeof value.$oid === 'string') return value.$oid
    if (typeof value.toHexString === 'function') {
      try { return value.toHexString() } catch (e) {}
    }
    if (typeof value.valueOf === 'function') {
      const v = value.valueOf()
      if (typeof v === 'string') return v
    }
  }
  try { return String(value) } catch (e) { return '' }
}

export default function Home() {
  console.debug && console.debug('Home component rendered');

  // Pagination state for the main list
  const PER_PAGE_ALL = 200
  const [pageAll, setPageAll] = useState(1)
  // Subscribe only to topograms without any folder for the main list
  const isReady = useSubscribe('topograms.paginated', useMemo(() => ({ noFolder: true, page: pageAll, limit: PER_PAGE_ALL }), [pageAll]))
  const tops = useFind(() => Topograms.find({}, { sort: { createdAt: -1 } }));
  const [totalAll, setTotalAll] = useState(0)
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
  const [exportTargetId, setExportTargetId] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [exportResult, setExportResult] = useState(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutRaw, setAboutRaw] = useState('')

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

  const sanitizeBundleId = (value) => {
    if (!value) return ''
    const safe = String(value).trim().replace(/[^a-zA-Z0-9-_.]+/g, '-').replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '')
    return safe ? safe.toLowerCase() : 'topogram'
  }

  const openExportDialog = (topogram) => {
    const docId = normalizeId(topogram && topogram._id)
    if (!docId) return
    const baseTitle = (topogram && (topogram.title || topogram.name)) || docId
    const defaultConfig = {
      id: sanitizeBundleId(baseTitle || docId || 'topogram'),
      title: baseTitle || 'Topogram Export',
      networkRenderer: 'cytoscape',
      geoRenderer: 'maplibre',
      emojiSupport: true,
      labeling: { nodeLabelMode: 'both', edgeLabelMode: 'text' }
    }
    setExportTargetId(docId)
    setExportConfig(defaultConfig)
    setExportError(null)
    setExportResult(null)
    setExportLoading(false)
    setExportOpen(true)
  }

  const closeExportDialog = () => {
    if (exportLoading) return
    setExportOpen(false)
    setExportTargetId(null)
    setExportConfig(null)
    setExportError(null)
    setExportResult(null)
  }

  const updateExportConfig = (updates) => {
    setExportConfig(prev => prev ? ({ ...prev, ...updates }) : prev)
  }

  const updateExportLabeling = (key, value) => {
    setExportConfig(prev => {
      if (!prev) return prev
      const labeling = { ...(prev.labeling || {}) }
      labeling[key] = value
      return { ...prev, labeling }
    })
  }

  const handleDeleteFolder = (folderName, count) => {
    if (!folderName) return
    const displayCount = typeof count === 'number' ? count : 0
    const message = displayCount > 0
      ? `Delete folder "${folderName}" and its ${displayCount} topogram${displayCount === 1 ? '' : 's'}? This cannot be undone.`
      : `Delete folder "${folderName}"?`
    if (typeof window !== 'undefined') {
      const ok = window.confirm(message)
      if (!ok) return
    }
    Meteor.call('topogram.deleteFolder', { folder: folderName }, (err) => {
      if (err) {
        console.error && console.error('topogram.deleteFolder failed', err)
        alert(`Failed to delete folder ${folderName}: ${err.reason || err.message || String(err)}`)
      }
    })
  }

  const handleDeleteTopogram = (topogram) => {
    const docId = normalizeId(topogram && topogram._id)
    if (!docId) return
    const title = (topogram && (topogram.title || topogram.name)) || docId
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete "${title}"? This action cannot be undone.`)
      if (!ok) return
    }
    Meteor.call('topogram.delete', { topogramId: docId }, (err) => {
      if (err) {
        console.error && console.error('topogram.delete failed', err)
        alert(`Failed to delete ${title}: ${err.reason || err.message || String(err)}`)
      }
    })
  }

  const handleExportSubmit = (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault()
    if (!exportTargetId || !exportConfig) return
    const sanitizedId = sanitizeBundleId(exportConfig.id || exportTargetId)
    const payload = {
      ...exportConfig,
      id: sanitizedId,
      topogramId: exportTargetId
    }
    setExportConfig(prev => prev ? ({ ...prev, id: sanitizedId }) : prev)
    setExportLoading(true)
    setExportError(null)
    setExportResult(null)
    Meteor.call('topogram.exportBundle', { topogramId: exportTargetId, config: payload }, (err, res) => {
      setExportLoading(false)
      if (err) {
        console.error && console.error('topogram.exportBundle failed', err)
        setExportError(err.reason || err.message || String(err))
        return
      }
      setExportResult(res)
    })
  }

  useEffect(() => {
    console.debug && console.debug('Home mounted - subscribe ready?', isReady && isReady());
  }, []);

  // Ensure `tops` is an array (useFind sometimes returns a cursor-like object)
  const topsList = Array.isArray(tops) ? tops : (tops && typeof tops.fetch === 'function' ? tops.fetch() : (tops || []))

  useEffect(() => {
    try {
      console.debug && console.debug('Home subscription ready:', isReady && isReady(), 'tops.length:', topsList.length);
    } catch (e) {}
  }, [isReady && isReady(), topsList.length]);

  // Counts are denormalized on Topogram documents (nodeCount / edgeCount)

  // Fetch total count for pagination (main list)
  useEffect(() => {
    // Count only documents without a folder for the main list pagination
    Meteor.call('topograms.count', { noFolder: true }, (err, res) => {
      if (err) return console.warn('topograms.count failed', err)
      setTotalAll(res || 0)
    })
  }, [pageAll])

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

  // Folder list is now driven by server counts
  const [folderList, setFolderList] = useState([])
  useEffect(() => {
    Meteor.call('topograms.folderCounts', (err, res) => {
      if (err) return console.warn('topograms.folderCounts failed', err)
      setFolderList(Array.isArray(res) ? res : [])
    })
  }, [])
  // Compute no-folder docs from the current page's dataset
  const noFolder = useMemo(() => (Array.isArray(topsList) ? topsList.filter(t => !(t && t.folder)) : []), [topsList])

  const exportReady = !!(exportConfig && exportConfig.id && exportConfig.title && exportConfig.networkRenderer && exportConfig.geoRenderer)
  const exportDownloadHref = exportResult && exportResult.filename ? (`/_exports/${exportResult.filename}`) : null

  // Auto-expand the first folder (if any) as a cue
  useEffect(() => {
    if (folderList && folderList.length) {
      setExpandedFolders(prev => (Object.keys(prev).length ? prev : { [folderList[0].name]: true }))
    }
  }, [folderList])

  // Debug panel toggle state - default true while investigating missing folders
  const [showDebug, setShowDebug] = useState(true)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState(null)
  const [moveSelectedFolder, setMoveSelectedFolder] = useState('')
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [createFolderName, setCreateFolderName] = useState('')
  const [moveToastOpen, setMoveToastOpen] = useState(false)
  const [moveToastData, setMoveToastData] = useState(null)
  const moveToastTimerRef = useRef(null)
  const [folderDeleteDialogOpen, setFolderDeleteDialogOpen] = useState(false)
  const [folderDeleteTarget, setFolderDeleteTarget] = useState(null)
  const [folderDeleteCount, setFolderDeleteCount] = useState(0)

  // Folder delete helpers (moved out of JSX to avoid syntax issues)
  const closeFolderDeleteDialog = () => {
    setFolderDeleteDialogOpen(false)
    setFolderDeleteTarget(null)
    setFolderDeleteCount(0)
  }

  const confirmFolderDeleteRemoveMeta = () => {
    const folder = folderDeleteTarget
    if (!folder) return closeFolderDeleteDialog()
    Meteor.call('topograms.deleteFolderMeta', { folder }, (err, res) => {
      if (err) {
        console.error && console.error('topograms.deleteFolderMeta failed', err)
        alert('Failed to remove folder metadata: ' + (err.reason || err.message || String(err)))
      } else {
        // refresh folder list
        Meteor.call('topograms.folderCounts', (err2, res2) => { if (!err2) setFolderList(Array.isArray(res2) ? res2 : []) })
      }
      closeFolderDeleteDialog()
    })
  }

  const confirmFolderDeleteRemoveAll = () => {
    const folder = folderDeleteTarget
    if (!folder) return closeFolderDeleteDialog()
    Meteor.call('topogram.deleteFolder', { folder }, (err, res) => {
      if (err) {
        console.error && console.error('topogram.deleteFolder failed', err)
        alert('Failed to delete folder and its maps: ' + (err.reason || err.message || String(err)))
      } else {
        Meteor.call('topograms.folderCounts', (err2, res2) => { if (!err2) setFolderList(Array.isArray(res2) ? res2 : []) })
      }
      closeFolderDeleteDialog()
    })
  }

  const openMoveDialog = (topogram) => {
    setMoveTarget(topogram)
    setMoveSelectedFolder(topogram && topogram.folder ? topogram.folder : '')
    setMoveDialogOpen(true)
  }

  const closeMoveDialog = () => {
    setMoveDialogOpen(false)
    setMoveTarget(null)
    setMoveSelectedFolder('')
  }

  const submitMove = () => {
    if (!moveTarget) return closeMoveDialog()
    const docId = normalizeId(moveTarget && moveTarget._id)
    if (!docId) return closeMoveDialog()
    const folder = moveSelectedFolder && moveSelectedFolder.trim() ? moveSelectedFolder.trim() : null
    const prevFolder = moveTarget && moveTarget.folder ? moveTarget.folder : null
    Meteor.call('topogram.moveToFolder', { topogramId: docId, folder }, (err, res) => {
      if (err) {
        console.error && console.error('topogram.moveToFolder failed', err)
        alert('Move failed: ' + (err.reason || err.message || String(err)))
        return closeMoveDialog()
      }
      // show undo toast with previous folder info
      setMoveToastData({ topogramId: docId, title: moveTarget && (moveTarget.title || moveTarget.name), from: prevFolder, to: folder })
      setMoveToastOpen(true)
      // auto-hide after 6s
  if (moveToastTimerRef.current) clearTimeout(moveToastTimerRef.current)
  moveToastTimerRef.current = setTimeout(() => { setMoveToastOpen(false); setMoveToastData(null); moveToastTimerRef.current = null }, 6000)
      // refresh folder list
      Meteor.call('topograms.folderCounts', (err2, res2) => { if (!err2) setFolderList(Array.isArray(res2) ? res2 : []) })
      closeMoveDialog()
    })
  }

  const undoMove = () => {
    if (!moveToastData) return
    const { topogramId, from } = moveToastData
    Meteor.call('topogram.moveToFolder', { topogramId, folder: from }, (err) => {
      if (err) return alert('Undo failed: ' + (err.reason || err.message || String(err)))
      setMoveToastOpen(false)
      setMoveToastData(null)
      Meteor.call('topograms.folderCounts', (err2, res2) => { if (!err2) setFolderList(Array.isArray(res2) ? res2 : []) })
    })
  }

  const openCreateFolder = () => { setCreateFolderName(''); setCreateFolderOpen(true) }
  const closeCreateFolder = () => { setCreateFolderOpen(false); setCreateFolderName('') }
  const submitCreateFolder = () => {
    const name = createFolderName && createFolderName.trim()
    if (!name) return alert('Please enter a folder name')
    Meteor.call('topograms.createFolder', { name }, (err) => {
      if (err) { alert('Create folder failed: ' + (err.reason || err.message || String(err))); return }
      // refresh folder list
      Meteor.call('topograms.folderCounts', (err2, res2) => { if (!err2) setFolderList(Array.isArray(res2) ? res2 : []) })
      closeCreateFolder()
    })
  }

  return (
    <div className="home-container compact-cards">
      <h1 className="home-title">Topogram Standard (Meteor 3)</h1>
      <p className="home-sub">Connected to: local Meteor Mongo</p>
      <div className="controls-row">
          <div className="controls-left">
            <div className="ready-count"><strong>Subscription ready:</strong> {String(isReady())} <strong>count:</strong> {topsList.length}</div>
          <button onClick={() => setImportModalOpen(true)} className="import-button">Import</button>
          <Button component="a" href="/builder" variant="outlined" size="small" sx={{ ml: 1 }}>Builder</Button>
          {isAdmin ? (
            <Button size="small" variant="outlined" sx={{ ml: 1 }} onClick={() => openCreateFolder()}>Create folder</Button>
          ) : null}
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
  <ImportAllModal open={importModalOpen} onClose={() => setImportModalOpen(false)} onEnqueue={(jobId) => { console.info('import job enqueued', jobId) }} />
      <Dialog open={exportOpen} onClose={closeExportDialog} fullWidth maxWidth="sm">
        <form onSubmit={handleExportSubmit}>
          <DialogTitle>Export topogram bundle</DialogTitle>
          <DialogContent dividers>
            <TextField
              label="Bundle ID"
              value={exportConfig ? exportConfig.id : ''}
              onChange={e => updateExportConfig({ id: e.target.value })}
              onBlur={e => updateExportConfig({ id: sanitizeBundleId(e.target.value) })}
              fullWidth
              margin="normal"
              required
              helperText="Used in filenames; letters, numbers, dashes and underscores only."
            />
            <TextField
              label="Title"
              value={exportConfig ? (exportConfig.title || '') : ''}
              onChange={e => updateExportConfig({ title: e.target.value })}
              fullWidth
              margin="normal"
              required
            />
            <FormControl fullWidth margin="normal" required>
              <InputLabel id="export-network-select">Network renderer</InputLabel>
              <Select
                labelId="export-network-select"
                value={exportConfig ? (exportConfig.networkRenderer || '') : ''}
                label="Network renderer"
                onChange={e => updateExportConfig({ networkRenderer: e.target.value })}
              >
                <MenuItem value="cytoscape">Cytoscape</MenuItem>
                <MenuItem value="sigma">Sigma</MenuItem>
                <MenuItem value="reagraph">Reagraph</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal" required>
              <InputLabel id="export-geo-select">Geo renderer</InputLabel>
              <Select
                labelId="export-geo-select"
                value={exportConfig ? (exportConfig.geoRenderer || '') : ''}
                label="Geo renderer"
                onChange={e => updateExportConfig({ geoRenderer: e.target.value })}
              >
                <MenuItem value="maplibre">MapLibre</MenuItem>
                <MenuItem value="leaflet">Leaflet</MenuItem>
                <MenuItem value="cesium">Cesium</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!(exportConfig && exportConfig.emojiSupport)}
                  onChange={(_, checked) => updateExportConfig({ emojiSupport: checked })}
                />
              }
              label="Include emoji support"
              sx={{ mt: 1 }}
            />
            <FormControl fullWidth margin="normal">
              <InputLabel id="export-node-label">Node label mode</InputLabel>
              <Select
                labelId="export-node-label"
                value={exportConfig && exportConfig.labeling ? (exportConfig.labeling.nodeLabelMode || 'both') : 'both'}
                label="Node label mode"
                onChange={e => updateExportLabeling('nodeLabelMode', e.target.value)}
              >
                <MenuItem value="name">Text</MenuItem>
                <MenuItem value="emoji">Emoji</MenuItem>
                <MenuItem value="both">Both</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel id="export-edge-label">Edge label mode</InputLabel>
              <Select
                labelId="export-edge-label"
                value={exportConfig && exportConfig.labeling ? (exportConfig.labeling.edgeLabelMode || 'text') : 'text'}
                label="Edge label mode"
                onChange={e => updateExportLabeling('edgeLabelMode', e.target.value)}
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="emoji">Emoji</MenuItem>
                <MenuItem value="both">Both</MenuItem>
              </Select>
            </FormControl>
            {exportError ? (
              <Alert severity="error" sx={{ mt: 2 }}>{exportError}</Alert>
            ) : null}
            {exportDownloadHref ? (
              <Alert severity="success" sx={{ mt: 2 }}>
                Bundle ready.&nbsp;
                <Button
                  component="a"
                  href={exportDownloadHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  variant="outlined"
                  sx={{ ml: 1 }}
                >
                  Download
                </Button>
              </Alert>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeExportDialog} disabled={exportLoading}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={!exportReady || exportLoading}>
              {exportLoading ? 'Exporting...' : 'Export'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
  {topsList.length === 0 && (folderList.length === 0) ? (
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
            {folderList.map(info => {
              const folderName = info && info.name
              const count = info && info.count
              if (!folderName) return null
              return (
                <li key={`folder-${folderName}`} className="topogram-item folder-item">
                  <div className="folder-header" onClick={() => toggleFolder(folderName)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{folderName}</div>
                    <div style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>{typeof count === 'number' ? `${count} map${count === 1 ? '' : 's'}` : ''}</div>
                    {isAdmin ? (
                      <div style={{ marginLeft: 'auto' }}>
                        <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); setFolderDeleteTarget(folderName); setFolderDeleteCount(typeof count === 'number' ? count : 0); setFolderDeleteDialogOpen(true); }}>Delete folder</Button>
                      </div>
                    ) : null}
                  </div>
                  {expandedFolders[folderName] ? (
                    <FolderSection
                      name={folderName}
                      perPage={50}
                      isAdmin={isAdmin}
                      onDeleteTopogram={handleDeleteTopogram}
                      onExport={openExportDialog}
                      onAbout={(md) => { setAboutRaw(md); setAboutOpen(true) }}
                      onMove={(t) => openMoveDialog(t)}
                    />
                  ) : null}
                </li>
              )
            })}
            {noFolder.map(t => {
              const docId = normalizeId(t && t._id)
              const keyId = docId || String(t && t._id || '')
              const route = docId ? `/t/${docId}` : `/t/${encodeURIComponent(String(t && t._id || ''))}`
                return (
                <li key={keyId} className="topogram-item">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                    <div style={{ flex: 1 }}>
                        <Link to={route} className="topogram-link">{t.title || t.name || docId || String(t && t._id)}</Link>
                        {t.description ? (<div className="topogram-desc">{t.description}</div>) : null}
                        {/* element counts (denormalized on document) */}
                        {(t && (typeof t.nodeCount === 'number' || typeof t.edgeCount === 'number')) ? (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                            Nodes: {typeof t.nodeCount === 'number' ? t.nodeCount : 0} • Edges: {typeof t.edgeCount === 'number' ? t.edgeCount : 0}
                          </div>
                        ) : null}
                        {/* Action buttons under the title */}
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* About button shown only when graph_desc exists on the topogram */}
                          {t && t.graph_desc ? (
                            <Button size="small" variant="outlined" onClick={() => { console.debug && console.debug('About clicked (no-folder)', t && t._id); setAboutRaw(t.graph_desc); setAboutOpen(true) }}>About</Button>
                          ) : null}
                          {isAdmin ? (
                            <div className="topogram-admin-actions" style={{ display: 'flex', gap: 8 }}>
                              <Button size="small" variant="outlined" onClick={() => openMoveDialog(t)}>Move to...</Button>
                              <Button size="small" color="error" variant="outlined" onClick={() => handleDeleteTopogram(t)} sx={{ ml: 1 }}>Delete</Button>
                              <Button size="small" variant="outlined" sx={{ ml: 1 }} onClick={() => openExportDialog(t)}>Export</Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ width: 8 }} />
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Main list pagination */}
          <div className="pagination-bar">
            <button type="button" className="page-btn" disabled={pageAll <= 1} onClick={() => setPageAll(p => Math.max(1, p - 1))}>Previous</button>
            <span className="page-info">Page {pageAll} / {Math.max(1, Math.ceil((totalAll || 0) / PER_PAGE_ALL))}</span>
            <button type="button" className="page-btn" disabled={pageAll >= Math.ceil((totalAll || 0) / PER_PAGE_ALL)} onClick={() => setPageAll(p => p + 1)}>Next</button>
          </div>

          {showDebug ? (
            <div className="folder-debug-panel">
              <div className="debug-header">
                <strong>Client Debug</strong>
                <button className="debug-hide" type="button" onClick={() => setShowDebug(false)}>Hide</button>
              </div>
              <div className="debug-body">
                <div><strong>Subscription ready:</strong> {String(isReady())}</div>
                <div><strong>topsList.length:</strong> {topsList.length} <small>(no-folder shown: {noFolder.length})</small></div>
                <div><strong>Folders:</strong> {folderList.map(f => f.name).join(', ') || '(none)'}</div>
              </div>
              <details className="debug-details">
                <summary>First 20 received topograms (client)</summary>
                <pre>{JSON.stringify(topsList.slice(0, 20), null, 2)}</pre>
              </details>
            </div>
          ) : null}
  {/* Global About dialog (always mounted) */}
  <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} markdown={aboutRaw} />
  {/* Move-to-folder dialog (admin) */}
  <Dialog open={moveDialogOpen} onClose={closeMoveDialog} fullWidth maxWidth="xs">
    <DialogTitle>Move topogram to folder</DialogTitle>
    <DialogContent>
      <FormControl fullWidth margin="normal">
        <InputLabel id="move-folder-select">Folder</InputLabel>
        <Select
          labelId="move-folder-select"
          value={moveSelectedFolder}
          label="Folder"
          onChange={e => setMoveSelectedFolder(e.target.value)}
        >
          <MenuItem value="">(No folder)</MenuItem>
          {folderList.map(f => (
            <MenuItem key={`fld-${f.name}`} value={f.name}>{f.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {moveTarget ? (
        <div style={{ marginTop: 8 }}>
          <strong>Topogram:</strong> {moveTarget.title || moveTarget.name || normalizeId(moveTarget._id)}
        </div>
      ) : null}
    </DialogContent>
    <DialogActions>
      <Button onClick={closeMoveDialog}>Cancel</Button>
      <Button onClick={submitMove} variant="contained">Move</Button>
    </DialogActions>
  </Dialog>

  {/* Folder delete confirmation dialog (admin) */}
  <Dialog open={folderDeleteDialogOpen} onClose={closeFolderDeleteDialog} fullWidth maxWidth="xs">
    <DialogTitle>Folder actions</DialogTitle>
    <DialogContent>
      <div>
        <div>Folder: <strong>{folderDeleteTarget}</strong></div>
        <div style={{ marginTop: 8 }}>Contains {folderDeleteCount} topogram{folderDeleteCount === 1 ? '' : 's'}.</div>
        <div style={{ marginTop: 12 }}>Choose an action:</div>
        <ul>
          <li>Remove folder metadata (reassign maps to the root/no-folder)</li>
          <li>Delete folder and all maps (irreversible)</li>
        </ul>
      </div>
    </DialogContent>
    <DialogActions>
      <Button onClick={closeFolderDeleteDialog}>Cancel</Button>
      <Button onClick={confirmFolderDeleteRemoveMeta} variant="outlined">Remove folder metadata</Button>
      <Button onClick={confirmFolderDeleteRemoveAll} color="error" variant="contained">Delete folder and maps</Button>
    </DialogActions>
  </Dialog>
  {/* Create folder dialog (admin) */}
  <Dialog open={createFolderOpen} onClose={closeCreateFolder} fullWidth maxWidth="xs">
    <DialogTitle>Create folder</DialogTitle>
    <DialogContent>
      <TextField label="Folder name" value={createFolderName} onChange={e => setCreateFolderName(e.target.value)} fullWidth sx={{ mt: 1 }} />
    </DialogContent>
    <DialogActions>
      <Button onClick={closeCreateFolder}>Cancel</Button>
      <Button onClick={submitCreateFolder} variant="contained">Create</Button>
    </DialogActions>
  </Dialog>

  {/* Move undo toast */}
  {moveToastOpen && moveToastData ? (
    <div style={{ position: 'fixed', left: 16, bottom: 16, background: '#222', color: '#fff', padding: 12, borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
      <div style={{ marginBottom: 6 }}>{moveToastData.title ? `${moveToastData.title} moved` : 'Topogram moved'}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button size="small" variant="outlined" onClick={() => { undoMove() }}>Undo</Button>
        <Button size="small" variant="contained" onClick={() => { setMoveToastOpen(false); setMoveToastData(null) }}>Dismiss</Button>
      </div>
    </div>
  ) : null}
  </div>
      )}
    </div>
  );
}

function FolderSection({ name, perPage = 50, isAdmin, onDeleteTopogram, onExport, onAbout, onMove }) {
  const [page, setPage] = useState(1)
  const ready = useSubscribe('topograms.paginated', useMemo(() => ({ folder: name, page, limit: perPage }), [name, page, perPage]))
  const items = useFind(() => Topograms.find({ folder: name }, { sort: { createdAt: -1 } }))
  const [total, setTotal] = useState(0)
  useEffect(() => {
    Meteor.call('topograms.count', { folder: name }, (err, res) => {
      if (err) return console.warn('topograms.count folder failed', err)
      setTotal(res || 0)
    })
  }, [name])
  const totalPages = Math.max(1, Math.ceil((total || 0) / perPage))

  return (
    <div className="folder-contents">
      {items.map(t => {
        const docId = normalizeId(t && t._id)
        const keyId = docId || String(t && t._id || '')
        const route = docId ? `/t/${docId}` : `/t/${encodeURIComponent(String(t && t._id || ''))}`
        return (
          <div key={keyId} className="topogram-item folder-card">
            <Link to={route} className="topogram-link">{t.title || t.name || docId || String(t && t._id)}</Link>
            {t.description ? (<div className="topogram-desc">{t.description}</div>) : null}
            {(t && (typeof t.nodeCount === 'number' || typeof t.edgeCount === 'number')) ? (
              <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                Nodes: {typeof t.nodeCount === 'number' ? t.nodeCount : 0} • Edges: {typeof t.edgeCount === 'number' ? t.edgeCount : 0}
              </div>
                  ) : null}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {t && t.graph_desc ? (
                      <Button size="small" variant="outlined" onClick={() => { console.debug && console.debug('About clicked (folder)', t && t._id); if (typeof onAbout === 'function') onAbout(t.graph_desc) }}>About</Button>
                    ) : null}
                    {isAdmin ? (
                      <div className="topogram-admin-actions" style={{ display: 'flex', gap: 8 }}>
                        <Button size="small" variant="outlined" onClick={() => { if (typeof onMove === 'function') onMove(t) }}>Move to...</Button>
                        <Button size="small" color="error" variant="outlined" onClick={() => onDeleteTopogram(t)} sx={{ ml: 1 }}>Delete</Button>
                        <Button size="small" variant="outlined" sx={{ ml: 1 }} onClick={() => onExport(t)}>Export</Button>
                      </div>
                    ) : null}
                  </div>
          </div>
        )
      })}
      {/* FolderSection delegates About dialog handling to parent via onAbout */}
      <div className="pagination-bar">
        <button type="button" className="page-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
        <span className="page-info">Page {page} / {totalPages}</span>
        <button type="button" className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
      </div>
    </div>
  )
}
