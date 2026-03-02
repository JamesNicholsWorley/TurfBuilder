// Print Manager for Turf Builder
// Generates printable walk lists with maps and voter information

class PrintManager {
    constructor(app) {
        this.app = app;
        this.defaultFields = ['full_name', 'party', 'precinct',
                               'voted_2023', 'voted_2024', 'voted_2025', 'score', 'notes'];
        this.selectedFields = [...this.defaultFields];
    }

    /**
     * Get currently selected print fields from UI
     */
    getSelectedFields() {
        const checkboxes = document.querySelectorAll('#printFieldsCheckboxes input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    /**
     * Sort addresses by street name (alphabetically) then address number (numerically)
     */
    sortAddresses(turf) {
        const addressData = [];

        for (const parcelId of turf.parcels) {
            const feature = this.app.parcelFeatureMap.get(parcelId);
            if (!feature) continue;

            const masterId = feature.properties.MASTER_ADDRESS_ID;
            const voters = this.app.voterDataLoaded ?
                this.app.voterService.getVotersForParcel(masterId) : [];

            const street = feature.properties.STREET_NAME || '';
            const number = feature.properties.ADDRESS_NUMBER || '';
            const unit = feature.properties.UNIT ? ` Unit ${feature.properties.UNIT}` : '';
            const fullAddress = `${number} ${street}${unit}`.trim();

            addressData.push({
                street: street,
                number: parseInt(number) || 0,
                fullAddress: fullAddress,
                voters: voters,
                feature: feature
            });
        }

        // Sort by street name (alphabetically), then address number (numerically)
        return addressData.sort((a, b) => {
            const streetCompare = a.street.localeCompare(b.street);
            return streetCompare !== 0 ? streetCompare : a.number - b.number;
        });
    }

    /**
     * Generate map page HTML
     */
    generateMapPage(turf, sortedAddresses, mapIndex = 0) {
        const addressCount = turf.parcels.size;
        const voterCount = this.app.voterDataLoaded ?
            sortedAddresses.reduce((sum, addr) => sum + addr.voters.length, 0) : 0;

        const mapId = mapIndex === 0 ? 'printMap' : `printMap_${mapIndex}`;
        const pageBreakClass = mapIndex > 0 ? ' page-break-before' : '';

        return `
        <div class="print-map-page${pageBreakClass}">
            <div class="print-header">
                <h1>Turf: ${turf.name}</h1>
                <div class="print-stats">
                    <strong>${addressCount}</strong> addresses •
                    ${voterCount > 0 ? `<strong>${voterCount}</strong> voters` : ''}
                </div>
            </div>
            <div id="${mapId}" class="map-container" style="height: 90vh;"></div>
        </div>
        `;
    }

    /**
     * Generate voter listing pages HTML
     */
    generateVoterPages(turf, sortedAddresses) {
        const fields = this.getSelectedFields();
        let html = `
        <div class="print-voter-page">
            <div class="print-header">
                <h2>Turf: ${turf.name} - Walk List</h2>
                <p>Sorted by address</p>
            </div>
        `;

        sortedAddresses.forEach((addr, idx) => {
            // Skip addresses with no voters when voter data is loaded
            if (this.app.voterDataLoaded && addr.voters.length === 0) {
                return;
            }

            if (addr.voters.length === 0 && !this.app.voterDataLoaded) {
                // No voter data loaded - just show address
                html += `
                <div class="print-address-block">
                    <div class="print-address-header">${addr.fullAddress}</div>
                    <p style="font-style: italic; color: #666; margin: 5px 0;">No voter data loaded</p>
                </div>
                `;
            } else {
                // Voters exist - show table
                html += `
                <div class="print-address-block">
                    <div class="print-address-header">${addr.fullAddress}</div>
                    <table class="print-voter-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                ${fields.map(field => {
                                    const displayName = this.app.voterService.getDisplayFieldName(field);
                                    const colClass = field === 'score' || field === 'notes' ? ` class="col-${field}"` : '';
                                    return `<th${colClass}>${displayName}</th>`;
                                }).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${addr.voters.map((voter, voterIdx) => `
                                <tr>
                                    <td>${voterIdx + 1}</td>
                                    ${fields.map(field => {
                                        let value = voter[field] || '';
                                        // Calculate age from DOB if age field is requested
                                        if (field === 'age' && voter.dob) {
                                            const age = this.calculateAge(voter.dob);
                                            value = age >= 0 ? age : '';
                                        }
                                        // Format age if DOB field
                                        else if (field === 'dob' && value) {
                                            const age = this.calculateAge(value);
                                            value = age >= 0 ? age : value;
                                        }
                                        const colClass = field === 'score' || field === 'notes' ? ` class="col-${field}"` : '';
                                        return `<td${colClass}>${this.escapeHtml(String(value))}</td>`;
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                `;
            }
        });

        html += '</div>';
        return html;
    }

    /**
     * Calculate age from date of birth
     */
    calculateAge(dob) {
        if (!dob) return -1;
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Print a single turf
     */
    printTurf(turfName) {
        const turf = this.app.turfs.get(turfName);
        if (!turf) {
            this.app.uiManager.showStatus('Turf not found', 'error');
            return;
        }

        if (turf.parcels.size === 0) {
            this.app.uiManager.showStatus('This turf has no addresses to print', 'error');
            return;
        }

        // Sort addresses
        const sortedAddresses = this.sortAddresses(turf);

        // Create print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
    <title>Print: ${turf.name}</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; }

        @media screen {
            body { background: #f5f5f5; padding: 20px; }
            .print-map-page, .print-voter-page {
                background: white;
                max-width: 8.5in;
                margin: 0 auto 20px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
        }

        @media print {
            @page {
                margin: 0.5in;
            }

            .print-map-page {
                width: 100%;
                height: calc(100vh - 1in);
                page-break-after: always;
                page-break-inside: avoid;
                display: flex;
                flex-direction: column;
            }

            .print-map-page:first-child {
                page-break-before: auto;
            }

            .print-map-page.page-break-before {
                page-break-before: always;
            }

            .print-map-page .print-header {
                flex-shrink: 0;
            }

            .print-map-page .map-container {
                flex: 1;
                width: 100%;
                min-height: 0;
            }

            .print-voter-page {
                padding: 0;
                font-size: 9pt;
            }
        }

        .print-header {
            padding: 0.25in;
            border-bottom: 2px solid #333;
            margin-bottom: 0.25in;
        }

        .print-header h1, .print-header h2 {
            margin: 0 0 8px 0;
            color: #2d3748;
        }

        .print-stats {
            font-size: 14pt;
            color: #666;
        }

        .print-address-block {
            page-break-inside: avoid;
            border-bottom: 1px solid #ddd;
            padding: 8px 0;
            margin-bottom: 8px;
        }

        .print-address-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 6px;
            background: #f5f5f5;
            padding: 6px 8px;
            border-left: 4px solid ${turf.color};
        }

        .print-voter-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
        }

        .print-voter-table th {
            background: #e0e0e0;
            border: 1px solid #999;
            padding: 4px;
            text-align: left;
            font-size: 8pt;
            font-weight: 600;
        }

        .print-voter-table td {
            border: 1px solid #ccc;
            padding: 3px 4px;
            font-size: 9pt;
        }

        .print-voter-table th.col-score,
        .print-voter-table td.col-score {
            width: 30px;
            text-align: center;
        }

        .print-voter-table th.col-notes,
        .print-voter-table td.col-notes {
            width: 120px;
        }

        .print-voter-table tr:nth-child(even) {
            background: #f9f9f9;
        }

        .map-container {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    ${this.generateMapPage(turf, sortedAddresses)}
    ${this.generateVoterPages(turf, sortedAddresses)}

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Initialize map
        const mapDiv = document.getElementById('printMap');
        if (mapDiv) {
            const map = L.map('printMap', {
                zoomControl: true,
                attributionControl: true
            });

            // Add CartoDB Light base layer
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                maxZoom: 19
            }).addTo(map);

            // Add markers
            const markers = [];
            ${sortedAddresses.map((addr, idx) => {
                const coords = addr.feature.geometry.coordinates;
                return `
                markers.push(L.circleMarker([${coords[1]}, ${coords[0]}], {
                    radius: 6,
                    fillColor: '${turf.color}',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).bindPopup('${addr.fullAddress.replace(/'/g, "\\'")}').addTo(map));
                `;
            }).join('')}

            // Fit bounds
            const bounds = ${JSON.stringify(this.calculateBounds(sortedAddresses))};
            map.fitBounds(bounds, { padding: [50, 50] });

            // Wait for tiles to load before printing
            setTimeout(() => {
                map.invalidateSize();
            }, 500);
        }
    </script>
</body>
</html>
        `);

        printWindow.document.close();

        // Wait for map to load, then focus for printing
        setTimeout(() => {
            printWindow.focus();
        }, 1500);

        this.app.uiManager.showStatus(`Print preview opened for "${turfName}"`, 'success');
    }

    /**
     * Calculate bounds for address list
     */
    calculateBounds(sortedAddresses) {
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        sortedAddresses.forEach(addr => {
            const coords = addr.feature.geometry.coordinates;
            minLng = Math.min(minLng, coords[0]);
            maxLng = Math.max(maxLng, coords[0]);
            minLat = Math.min(minLat, coords[1]);
            maxLat = Math.max(maxLat, coords[1]);
        });

        const lngPadding = (maxLng - minLng) * 0.1 || 0.001;
        const latPadding = (maxLat - minLat) * 0.1 || 0.001;

        return [
            [minLat - latPadding, minLng - lngPadding],
            [maxLat + latPadding, maxLng + lngPadding]
        ];
    }

    /**
     * Print all turfs (in a single window)
     */
    printAllTurfs(lockedOnly = false) {
        if (this.app.turfs.size === 0) {
            this.app.uiManager.showStatus('No turfs to print', 'error');
            return;
        }

        // Collect turfs to print
        const turfsToPrint = [];
        for (const [name, turf] of this.app.turfs) {
            if (turf.parcels.size > 0) {
                // Filter by lock status if requested
                if (!lockedOnly || turf.locked) {
                    turfsToPrint.push({ name, turf });
                }
            }
        }

        // Sort turfs alphabetically with natural number sorting (same as sidebar)
        turfsToPrint.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
        );

        if (turfsToPrint.length === 0) {
            const message = lockedOnly ? 'No locked turfs to print' : 'No turfs to print';
            this.app.uiManager.showStatus(message, 'error');
            return;
        }

        // Generate combined HTML for all turfs
        let combinedContent = '';

        turfsToPrint.forEach(({ name, turf }, index) => {
            const sortedAddresses = this.sortAddresses(turf);

            // Add map page with unique ID
            combinedContent += this.generateMapPage(turf, sortedAddresses, index);

            // Add voter pages
            combinedContent += this.generateVoterPages(turf, sortedAddresses);
        });

        // Generate map initialization scripts for all turfs
        let mapScripts = '';
        turfsToPrint.forEach(({ name, turf }, index) => {
            const sortedAddresses = this.sortAddresses(turf);
            const mapId = index === 0 ? 'printMap' : `printMap_${index}`;
            const bounds = this.calculateBounds(sortedAddresses);

            mapScripts += `
            // Map for ${name}
            (function() {
                const mapDiv = document.getElementById('${mapId}');
                if (mapDiv) {
                    const map = L.map('${mapId}', {
                        zoomControl: true,
                        attributionControl: true
                    });

                    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                        maxZoom: 19
                    }).addTo(map);

                    ${sortedAddresses.map((addr) => {
                        const coords = addr.feature.geometry.coordinates;
                        return `
                        L.circleMarker([${coords[1]}, ${coords[0]}], {
                            radius: 6,
                            fillColor: '${turf.color}',
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).bindPopup('${addr.fullAddress.replace(/'/g, "\\'")}').addTo(map);
                        `;
                    }).join('')}

                    map.fitBounds(${JSON.stringify(bounds)}, { padding: [50, 50] });
                }
            })();
            `;
        });

        // Create print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
    <title>Print All Turfs${lockedOnly ? ' (Locked)' : ''}</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; }

        @media screen {
            body { background: #f5f5f5; padding: 20px; }
            .print-map-page, .print-voter-page {
                background: white;
                max-width: 8.5in;
                margin: 0 auto 20px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
        }

        @media print {
            @page {
                margin: 0.5in;
            }

            .print-map-page {
                width: 100%;
                height: calc(100vh - 1in);
                page-break-after: always;
                page-break-inside: avoid;
                display: flex;
                flex-direction: column;
            }

            .print-map-page:first-child {
                page-break-before: auto;
            }

            .print-map-page.page-break-before {
                page-break-before: always;
            }

            .print-map-page .print-header {
                flex-shrink: 0;
            }

            .print-map-page .map-container {
                flex: 1;
                width: 100%;
                min-height: 0;
            }

            .print-voter-page {
                padding: 0;
                font-size: 9pt;
            }
        }

        .print-header {
            padding: 0.25in;
            border-bottom: 2px solid #333;
            margin-bottom: 0.25in;
        }

        .print-header h1, .print-header h2 {
            margin: 0 0 8px 0;
            color: #2d3748;
        }

        .print-stats {
            font-size: 14pt;
            color: #666;
        }

        .print-address-block {
            page-break-inside: avoid;
            border-bottom: 1px solid #ddd;
            padding: 8px 0;
            margin-bottom: 8px;
        }

        .print-address-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 6px;
            background: #f5f5f5;
            padding: 6px 8px;
        }

        .print-voter-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
        }

        .print-voter-table th {
            background: #e0e0e0;
            border: 1px solid #999;
            padding: 4px;
            text-align: left;
            font-size: 8pt;
            font-weight: 600;
        }

        .print-voter-table td {
            border: 1px solid #ccc;
            padding: 3px 4px;
            font-size: 9pt;
        }

        .print-voter-table th.col-score,
        .print-voter-table td.col-score {
            width: 30px;
            text-align: center;
        }

        .print-voter-table th.col-notes,
        .print-voter-table td.col-notes {
            width: 120px;
        }

        .print-voter-table tr:nth-child(even) {
            background: #f9f9f9;
        }

        .map-container {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    ${combinedContent}

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        ${mapScripts}

        // Wait for all maps to load before focusing window
        setTimeout(() => {
            window.focus();
        }, 1500);
    </script>
</body>
</html>
        `);

        printWindow.document.close();

        const message = lockedOnly ?
            `Print preview opened for ${turfsToPrint.length} locked turf(s)` :
            `Print preview opened for ${turfsToPrint.length} turf(s)`;
        this.app.uiManager.showStatus(message, 'success');
    }
}
