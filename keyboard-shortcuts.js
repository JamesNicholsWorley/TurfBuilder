class KeyboardShortcuts {
    constructor(app) {
        this.app = app;
        this.enabled = true;

        // Keyboard shortcuts configuration
        this.shortcuts = {
            // Contact status shortcuts
            'c': { action: () => this.setStatus('contacted'), description: 'Mark as Contacted' },
            'n': { action: () => this.setStatus('no_answer'), description: 'Mark as No Answer' },
            'r': { action: () => this.setStatus('refused'), description: 'Mark as Refused' },
            'h': { action: () => this.setStatus('not_home'), description: 'Mark as Not Home' },
            'f': { action: () => this.setStatus('follow_up'), description: 'Mark for Follow Up' },
            's': { action: () => this.setStatus('skip'), description: 'Skip address' },

            // Support level shortcuts (1-5)
            '1': { action: () => this.setSupportLevel(1), description: 'Support Level 1' },
            '2': { action: () => this.setSupportLevel(2), description: 'Support Level 2' },
            '3': { action: () => this.setSupportLevel(3), description: 'Support Level 3' },
            '4': { action: () => this.setSupportLevel(4), description: 'Support Level 4' },
            '5': { action: () => this.setSupportLevel(5), description: 'Support Level 5' },

            // Navigation shortcuts
            'ArrowRight': { action: () => this.nextAddress(), description: 'Next address' },
            'ArrowLeft': { action: () => this.previousAddress(), description: 'Previous address' },

            // Focus notes field
            ' ': { action: (e) => this.focusNotes(e), description: 'Focus notes field' },

            // Save and move to next (when in textarea)
            'Enter': { action: (e) => this.saveAndNext(e), description: 'Save and next (in notes)' }
        };

        this.bindShortcuts();
        console.log('KeyboardShortcuts initialized');
    }

    bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't process if shortcuts are disabled
            if (!this.enabled) {
                return;
            }

            // Check if user is typing in a text input or textarea
            const isTyping = (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');

            // Allow Enter key in textarea (for save and next)
            if (isTyping && e.key === 'Enter' && e.target.tagName === 'TEXTAREA') {
                const shortcut = this.shortcuts[e.key];
                if (shortcut) {
                    shortcut.action(e);
                }
                return;
            }

            // Ignore all other shortcuts when typing (except Enter handled above)
            if (isTyping && e.key !== 'Enter') {
                return;
            }

            // Process shortcut
            const shortcut = this.shortcuts[e.key];
            if (shortcut) {
                e.preventDefault();
                shortcut.action(e);
            }
        });

        console.log('Keyboard shortcuts bound');
    }

    // Set contact status
    setStatus(status) {
        if (!this.app.selectedTurf || !this.app.addressesInTurf || this.app.addressesInTurf.length === 0) {
            console.warn('Cannot set status: no active canvassing session');
            return;
        }

        const currentAddress = this.app.addressesInTurf[this.app.currentAddressIndex];
        if (!currentAddress) {
            console.warn('Cannot set status: no current address');
            return;
        }

        this.app.recordContact({ contactStatus: status });
        console.log(`Set status to ${status} via keyboard shortcut`);
    }

    // Set support level
    setSupportLevel(level) {
        if (!this.app.selectedTurf || !this.app.addressesInTurf || this.app.addressesInTurf.length === 0) {
            console.warn('Cannot set support level: no active canvassing session');
            return;
        }

        const currentAddress = this.app.addressesInTurf[this.app.currentAddressIndex];
        if (!currentAddress) {
            console.warn('Cannot set support level: no current address');
            return;
        }

        // Get current contact to check status
        const masterId = currentAddress.masterId || currentAddress.MASTER_ADDRESS_ID;
        const contact = this.app.contactService.getContact(masterId);

        // Can only set support level if status is 'contacted'
        if (!contact || contact.contactStatus !== 'contacted') {
            // Auto-set status to contacted when support level is entered
            this.app.recordContact({
                contactStatus: 'contacted',
                supportLevel: level
            });
            console.log(`Auto-set status to contacted and support level to ${level}`);
        } else {
            this.app.recordContact({ supportLevel: level });
            console.log(`Set support level to ${level} via keyboard shortcut`);
        }
    }

    // Navigate to next address
    nextAddress() {
        if (this.app.nextAddress) {
            this.app.nextAddress();
        }
    }

    // Navigate to previous address
    previousAddress() {
        if (this.app.previousAddress) {
            this.app.previousAddress();
        }
    }

    // Focus notes field
    focusNotes(e) {
        const notesField = document.getElementById('contactNotes');
        if (notesField) {
            e.preventDefault();
            notesField.focus();
        }
    }

    // Save and move to next (when Enter pressed in textarea)
    saveAndNext(e) {
        // Only if in textarea
        if (e.target.tagName === 'TEXTAREA') {
            e.preventDefault();
            // Notes are auto-saved via onchange, just navigate
            this.nextAddress();
        }
    }

    // Enable shortcuts
    enable() {
        this.enabled = true;
        console.log('Keyboard shortcuts enabled');
    }

    // Disable shortcuts (e.g., when modal is open)
    disable() {
        this.enabled = false;
        console.log('Keyboard shortcuts disabled');
    }

    // Get help text for shortcuts
    getHelpText() {
        return `
Keyboard Shortcuts:
- C: Mark as Contacted
- N: Mark as No Answer
- R: Mark as Refused
- H: Mark as Not Home
- F: Mark for Follow Up
- S: Skip address
- 1-5: Set Support Level (auto-marks as Contacted)
- → (Right Arrow): Next address
- ← (Left Arrow): Previous address
- Space: Focus notes field
- Enter (in notes): Save and move to next
        `.trim();
    }
}
