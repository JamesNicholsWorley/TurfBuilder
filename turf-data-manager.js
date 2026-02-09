class DataManager {
    constructor(app) {
        this.app = app;
        this.importData = null;
    }

    // NEW: Analyze voter field types for filtering
    analyzeVoterFieldTypes() {
        if (!this.app.voterDataLoaded || !this.app.voterData) {
            log('No voter data to analyze');
            return;
        }
        
        this.app.fieldStats = {};
        
        // Get all voters from all parcels
        const allVoters = [];
        for (const voters of this.app.voterData.values()) {
            allVoters.push(...voters);
        }
        
        if (allVoters.length === 0) {
            log('No voters found in voter data');
            return;
        }
        
        // Get all available voter fields
        const voterFields = this.app.voterService.getAvailableVoterFields();
        
        log(`Analyzing ${voterFields.length} voter fields from ${allVoters.length} voters`);
        
        voterFields.forEach(field => {
            const values = allVoters
                .map(v => v[field])
                .filter(v => v !== null && v !== undefined && v !== '');
            
            if (values.length === 0) {
                this.app.fieldStats[field] = { type: 'empty', uniqueValues: [] };
                return;
            }
            
            // Determine if field should be numeric
            // Age is calculated, so check for election_count and any field with numbers
            const isNumericField = field === 'election_count' || 
                                  field === 'household_count' ||
                                  field.includes('count');
            
            // Special handling for DOB - calculate age ranges
            if (field === 'dob') {
                const ages = values
                    .map(dob => this.app.voterService.calculateAge(dob))
                    .filter(age => age !== null);
                
                if (ages.length > 0) {
                    this.app.fieldStats['age'] = {
                        type: 'numeric',
                        min: Math.min(...ages),
                        max: Math.max(...ages),
                        values: ages
                    };
                }
                // Don't analyze DOB as categorical
                return;
            }
            
            if (isNumericField) {
                const numericValues = values.filter(v => !isNaN(v) && v !== '');
                if (numericValues.length > values.length * 0.3) {
                    const nums = numericValues.map(v => parseFloat(v));
                    this.app.fieldStats[field] = {
                        type: 'numeric',
                        min: Math.min(...nums),
                        max: Math.max(...nums),
                        values: nums
                    };
                    return;
                }
            }
            
            // Categorical field
            const uniqueValues = [...new Set(values.map(v => String(v)))];
            this.app.fieldStats[field] = {
                type: 'categorical',
                uniqueValues: uniqueValues.sort(),
                valueCount: uniqueValues.length
            };
        });
        
        log('Voter field analysis complete:', this.app.fieldStats);
    }

    analyzeAddressPointFields() {
        if (!this.app.parcelData?.features?.length) {
            log('No parcel data to analyze');
            return;
        }

        const features = this.app.parcelData.features;

        // All address fields from AddressPointFields.md
        const fieldsToAnalyze = [
            'POINT_TYPE', 'STREETNAME', 'BUILDING', 'FLOOR', 'UNIT', 'ROOM',
            'ZIPCODE', 'NEIGHBORHD', 'COMMUNITY', 'TOWN', 'STATE',
            'ADDR_NUM', 'NUM1', 'NUM2',
            'PRE_DIR', 'POST_DIR', 'PRE_TYPE', 'POST_TYPE', 'BASE',
            'REL_LOC', 'SITE_NAME', 'SUBSITE'
        ];

        fieldsToAnalyze.forEach(field => {
            const values = features
                .map(f => f.properties[field])
                .filter(v => v != null && v !== '');

            if (values.length === 0) {
                this.app.fieldStats[field] = { type: 'empty', uniqueValues: [] };
                return;
            }

            // Check if numeric (NUM fields and ADDR_NUM)
            const isNumericField = field.includes('NUM') || field === 'ADDR_NUM';

            if (isNumericField) {
                const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                if (nums.length > 0) {
                    this.app.fieldStats[field] = {
                        type: 'numeric',
                        min: Math.min(...nums),
                        max: Math.max(...nums),
                        values: nums
                    };
                    return;
                }
            }

            // Categorical
            const uniqueValues = [...new Set(values.map(String))].sort();
            this.app.fieldStats[field] = {
                type: 'categorical',
                uniqueValues: uniqueValues,
                valueCount: uniqueValues.length
            };
        });

        log('Address point field analysis complete:', Object.keys(this.app.fieldStats).length, 'fields');
    }

    // UPDATED: Export turf assignments (simple CSV)
    exportTurfCSV() {
        if (!this.app.parcelData || this.app.turfs.size === 0) {
            this.app.uiManager.showStatus('No data to export', 'error');
            return;
        }

        try {
            let csvContent = `MASTER_ADDRESS_ID,Turf,Address,Voter_Count\n`;

            this.app.parcelData.features.forEach(feature => {
                const parcelId = this.app.getParcelId(feature);
                const turf = this.app.findParcelTurf(parcelId);

                // Only export assigned address points
                if (turf) {
                    const objectId = feature.properties.MASTER_ADDRESS_ID;
                    const addressNum = feature.properties.ADDRESS_NUMBER || '';
                    const streetName = feature.properties.STREET_NAME || '';
                    const address = `${addressNum} ${streetName}`.trim();

                    // Get voter count
                    let voterCount = 0;
                    if (this.app.voterDataLoaded) {
                        const voters = this.app.voterService.getVotersForParcel(objectId);
                        voterCount = voters.length;
                    }

                    csvContent += `"${objectId}","${turf.name}","${address}",${voterCount}\n`;
                }
            });

            this.downloadCSV(csvContent, 'turf_assignments');
            
            this.app.uiManager.showStatus('Turf assignments exported successfully!', 'success');
            log('Turf CSV export completed');
            
        } catch (error) {
            console.error('Error exporting turf CSV:', error);
            this.app.uiManager.showStatus('Error exporting CSV: ' + error.message, 'error');
        }
    }

    // NEW: Export detailed data with all voter information
    exportDetailedCSV() {
        if (!this.app.parcelData) {
            this.app.uiManager.showStatus('No parcel data to export', 'error');
            return;
        }

        try {
            // Build headers
            const headers = ['MASTER_ADDRESS_ID', 'Turf', 'Address'];

            // Add voter fields if voter data is loaded
            if (this.app.voterDataLoaded) {
                const voterFields = this.app.voterService.getAvailableVoterFields();
                voterFields.forEach(field => {
                    const displayName = this.app.voterService.getDisplayFieldName(field);
                    headers.push(displayName);
                });
            }

            let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';

            // Export each address point
            this.app.parcelData.features.forEach(feature => {
                const parcelId = this.app.getParcelId(feature);
                const turf = this.app.findParcelTurf(parcelId);
                const objectId = feature.properties.MASTER_ADDRESS_ID;
                const addressNum = feature.properties.ADDRESS_NUMBER || '';
                const streetName = feature.properties.STREET_NAME || '';
                const address = `${addressNum} ${streetName}`.trim();

                if (this.app.voterDataLoaded) {
                    const voters = this.app.voterService.getVotersForParcel(objectId);

                    if (voters.length > 0) {
                        // One row per voter
                        voters.forEach(voter => {
                            const row = [
                                `"${objectId}"`,
                                `"${turf ? turf.name : ''}"`,
                                `"${address}"`
                            ];

                            // Add all voter fields
                            const voterFields = this.app.voterService.getAvailableVoterFields();
                            voterFields.forEach(field => {
                                const value = voter[field] || '';
                                row.push(`"${String(value).replace(/"/g, '""')}"`);
                            });

                            csvContent += row.join(',') + '\n';
                        });
                    } else {
                        // No voters - just export address point info
                        const row = [
                            `"${objectId}"`,
                            `"${turf ? turf.name : ''}"`,
                            `"${address}"`
                        ];

                        // Empty voter fields
                        const voterFields = this.app.voterService.getAvailableVoterFields();
                        voterFields.forEach(() => row.push('""'));
                        
                        csvContent += row.join(',') + '\n';
                    }
                } else {
                    // No voter data - just export parcel info
                    csvContent += `"${locId}","${turf ? turf.name : ''}","${address}"\n`;
                }
            });

            this.downloadCSV(csvContent, 'detailed_turf_data');
            
            this.app.uiManager.showStatus('Detailed data exported successfully!', 'success');
            log('Detailed CSV export completed');
            
        } catch (error) {
            console.error('Error exporting detailed CSV:', error);
            this.app.uiManager.showStatus('Error exporting detailed CSV: ' + error.message, 'error');
        }
    }

    // Helper method for CSV download
    downloadCSV(csvContent, baseName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        const townText = this.app.selectedTownNames.length === 1 
            ? this.app.selectedTownNames[0].replace(/\s+/g, '_')
            : `${this.app.selectedTownNames.length}_towns`;
        
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `${baseName}_${townText}_${timestamp}.csv`;
        
        if (navigator.msSaveBlob) {
            navigator.msSaveBlob(blob, filename);
        } else {
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }
    }

    // Import turf assignments
    showImportDialog() {
        if (this.app.uiManager.statusTimeout) {
            clearTimeout(this.app.uiManager.statusTimeout);
            this.app.uiManager.statusTimeout = null;
        }
        
        const importDiv = document.getElementById('importDialog');
        importDiv.innerHTML = `
            <div class="status-message status-success">
                <h4>Import Turf Assignments</h4>
                <p>Upload a CSV file with turf assignments:</p>
                <input type="file" id="importFileInput" accept=".csv" style="margin: 10px 0;">
                <div id="importControls" style="display: none;">
                    <div class="radio-group">
                        <label><strong>Import Mode:</strong></label>
                        <div class="radio-option">
                            <input type="radio" name="importMode" value="replace" id="importReplace" checked>
                            <label for="importReplace">Replace Current - Clear all existing assignments and use only those from CSV</label>
                        </div>
                        <div class="radio-option">
                            <input type="radio" name="importMode" value="merge" id="importMerge">
                            <label for="importMerge">Merge - Keep existing assignments, update only parcels in CSV</label>
                        </div>
                    </div>
                    <div id="importPreview" style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px; max-height: 150px; overflow-y: auto;"></div>
                    <button onclick="app.dataManager.performImport()" class="btn btn-primary" style="margin-top: 10px;">Import Data</button>
                </div>
                <button onclick="app.dataManager.cancelImport()" class="btn btn-secondary" style="margin-left: 10px;">Cancel</button>
            </div>
        `;
        
        document.getElementById('importFileInput').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.handleImportFile(e.target.files[0]);
            }
        });
    }

    async handleImportFile(file) {
        try {
            const text = await this.readFileAsText(file);
            const lines = text.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                this.app.uiManager.showStatus('CSV file must have at least a header and one data row', 'error');
                return;
            }
            
            const headers = this.parseCSVLine(lines[0]);

            // Validate CSV format - need MASTER_ADDRESS_ID and Turf columns
            if (!headers.includes('MASTER_ADDRESS_ID') || !headers.includes('Turf')) {
                this.app.uiManager.showStatus('CSV must have columns "MASTER_ADDRESS_ID" and "Turf"', 'error');
                return;
            }

            const locIdIndex = headers.indexOf('MASTER_ADDRESS_ID');
            const turfIndex = headers.indexOf('Turf');
            
            const assignments = [];
            const turfs = new Set();
            const dataLines = lines.slice(1);
            
            for (let i = 0; i < Math.min(dataLines.length, 1000); i++) {
                const values = this.parseCSVLine(dataLines[i]);
                if (values.length >= Math.max(locIdIndex, turfIndex) + 1) {
                    const locId = String(values[locIdIndex] || '').trim();
                    const turf = String(values[turfIndex] || '').trim();
                    
                    if (locId && turf) {
                        assignments.push({ locId, turf });
                        turfs.add(turf);
                    }
                }
            }
            
            if (assignments.length === 0) {
                this.app.uiManager.showStatus('No valid assignments found in CSV file', 'error');
                return;
            }
            
            // Store import data
            this.importData = {
                assignments: dataLines.map(line => {
                    const values = this.parseCSVLine(line);
                    if (values.length >= Math.max(locIdIndex, turfIndex) + 1) {
                        const locId = String(values[locIdIndex] || '').trim();
                        const turf = String(values[turfIndex] || '').trim();
                        if (locId && turf) {
                            return { locId, turf };
                        }
                    }
                    return null;
                }).filter(a => a !== null),
                turfs: Array.from(turfs)
            };
            
            // Show preview
            const previewDiv = document.getElementById('importPreview');
            const sampleAssignments = assignments.slice(0, 10);
            const moreCount = assignments.length - sampleAssignments.length;
            
            let previewHtml = `<strong>Preview (${assignments.length} assignments found):</strong><br>`;
            previewHtml += sampleAssignments.map(a => `${a.locId} → ${a.turf}`).join('<br>');
            if (moreCount > 0) {
                previewHtml += `<br><em>...and ${moreCount} more</em>`;
            }
            previewHtml += `<br><br><strong>Turfs (${turfs.size}):</strong> ${Array.from(turfs).join(', ')}`;
            
            previewDiv.innerHTML = previewHtml;
            document.getElementById('importControls').style.display = 'block';
            
        } catch (error) {
            this.app.uiManager.showStatus('Error reading CSV file: ' + error.message, 'error');
        }
    }

    performImport() {
        if (!this.importData) return;
        
        const mode = document.querySelector('input[name="importMode"]:checked').value;
        
        this.app.saveUndoState(`Import ${this.importData.assignments.length} assignments (${mode} mode)`);
        
        try {
            if (mode === 'replace') {
                this.app.turfs.clear();
            }
            
            // Create turfs that don't exist
            this.importData.turfs.forEach(turfName => {
                if (!this.app.turfs.has(turfName)) {
                    const turf = {
                        name: turfName,
                        parcels: new Set(),
                        color: this.app.colors[this.app.colorIndex % this.app.colors.length]
                    };
                    this.app.colorIndex++;
                    this.app.turfs.set(turfName, turf);
                }
            });
            
            // Apply assignments
            let successCount = 0;
            let notFoundCount = 0;
            
            this.importData.assignments.forEach(({ locId, turf }) => {
                // Find the address point by MASTER_ADDRESS_ID
                const parcel = this.app.parcelData.features.find(f =>
                    String(f.properties.MASTER_ADDRESS_ID) === locId
                );

                if (!parcel) {
                    notFoundCount++;
                    return;
                }

                const parcelId = this.app.getParcelId(parcel);

                // Remove address point from any existing turf
                for (const [name, t] of this.app.turfs) {
                    t.parcels.delete(parcelId);
                }

                // Add to target turf
                const targetTurf = this.app.turfs.get(turf);
                if (targetTurf) {
                    targetTurf.parcels.add(parcelId);
                    successCount++;
                }
            });
            
            // Remove empty turfs if in replace mode
            if (mode === 'replace') {
                for (const [name, turf] of this.app.turfs) {
                    if (turf.parcels.size === 0) {
                        this.app.turfs.delete(name);
                    }
                }
            }
            
            // Update UI
            this.app.updateParcelStyles();
            this.app.uiManager.updateTurfsList();
            
            let statusMessage = `Import completed! ${successCount} address points assigned`;
            if (notFoundCount > 0) {
                statusMessage += `, ${notFoundCount} MASTER_ADDRESS_IDs not found in loaded data`;
            }
            
            this.cancelImport();
            this.app.uiManager.showStatus(statusMessage, 'success');
            this.app.uiManager.showUndoNotification();
            
        } catch (error) {
            this.app.uiManager.showStatus('Error importing data: ' + error.message, 'error');
        }
    }

    cancelImport() {
        this.importData = null;
        document.getElementById('importDialog').innerHTML = '';
    }

    exportPreviousState() {
        if (!this.app.undoState) {
            this.app.uiManager.showStatus('No previous state to export', 'error');
            return;
        }

        try {
            let csvContent = `MASTER_ADDRESS_ID,Turf\n`;

            // Export from undo state
            for (const [turfName, turf] of this.app.undoState.turfs) {
                for (const parcelId of turf.parcels) {
                    // Find the address point to get MASTER_ADDRESS_ID
                    const parcel = this.app.parcelData.features.find(f =>
                        this.app.getParcelId(f) === parcelId
                    );

                    if (parcel) {
                        const objectId = parcel.properties.MASTER_ADDRESS_ID;
                        csvContent += `"${objectId}","${turfName}"\n`;
                    }
                }
            }

            this.downloadCSV(csvContent, 'previous_turf_assignments');
            
            this.app.uiManager.showStatus('Previous state exported successfully!', 'success');
            
        } catch (error) {
            console.error('Error exporting previous state:', error);
            this.app.uiManager.showStatus('Error exporting previous state: ' + error.message, 'error');
        }
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/"/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim().replace(/"/g, ''));
        return result;
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}
