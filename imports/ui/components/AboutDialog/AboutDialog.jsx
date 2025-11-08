import React, { useMemo } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export default function AboutDialog({ open, onClose, markdown }) {
  const safeHtml = useMemo(() => {
    try {
      const raw = String(markdown || '')
      const html = marked.parse(raw || '')
      return DOMPurify.sanitize(html)
    } catch (e) { return '' }
  }, [markdown])

  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>About this map</DialogTitle>
      <DialogContent dividers>
        { safeHtml ? (
          <div style={{ fontSize: 14, lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: safeHtml }} />
        ) : (
          <div style={{ color: '#666', fontStyle: 'italic' }}>No description available for this map.</div>
        ) }
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">Close</Button>
      </DialogActions>
    </Dialog>
  )
}
