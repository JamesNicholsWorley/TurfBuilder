// This voter-service.js file should be saved and we'll create the modified app.js next
class VoterService {
    constructor(app) {
        this.app = app;
        
        // Voter field mappings from CSV headers to internal field names
        this.voterFieldMappings = {
            'Turf': 'turf',
            'Turf Name': 'turf',
            'turf': 'turf',
            'Voter ID Number': 'voter_id',
            'Full name': 'full_name',
            'Last Name': 'last_name',
            'First Name': 'first_name',
            'Middle Name': 'middle_name',
            'Voter Title': 'title',
            'Full residential address': 'full_address',
            'Residential Address - Street Number': 'street_number',
            'Residential Address - Street Suffix': 'street_suffix',
            'Residential Address - Street Name': 'street_name',
            'Residential Address - Apartment Number': 'apt_number',
            'Residential Address - Zip Code': 'zip_code',
            'Mailing Address - Street Number/Name': 'mailing_street',
            'Mailing Address - Apartment Number': 'mailing_apt',
            'Mailing Address - City/Town': 'mailing_city',
            'Mailing Address - State': 'mailing_state',
            'Mailing Address - Zip Code': 'mailing_zip',
            'Type of Election': 'election_type',
            'Party Affiliation': 'party',
            'Date of Birth': 'dob',
            'Date of Registration': 'registration_date',
            'Precinct Number': 'precinct',
            'Voter Status': 'status',
            'City/ Town Name': 'city_town',
            'Voter Status r': 'status_r',
            '2023': 'voted_2023',
            '2024': 'voted_2024',
            '2025': 'voted_2025',
            'Election count': 'election_count',
            'House mates': 'household_count',
            'Head of house': 'head_of_house'
        };
        
        // Fields to display in UI (user-friendly names)
        this.displayFieldNames = {
            // Voter fields
            'full_name': 'Full Name',
            'party': 'Party',
            'dob': 'Date of Birth',
            'precinct': 'Precinct',
            'status': 'Status',
            'election_count': 'Elections Voted',
            'voted_2023': '2023',
            'voted_2024': '2024',
            'voted_2025': '2025',
            'household_count': 'Household Size',
            // Address point fields
            'POINT_TYPE': 'Address Type',
            'STREETNAME': 'Street Name',
            'BUILDING': 'Building',
            'FLOOR': 'Floor',
            'UNIT': 'Unit',
            'ROOM': 'Room',
            'ZIPCODE': 'ZIP Code',
            'NEIGHBORHD': 'Neighborhood',
            'COMMUNITY': 'Community',
            'TOWN': 'Town',
            'STATE': 'State',
            'ADDR_NUM': 'Address Number',
            'NUM1': 'Street Number',
            'NUM2': 'Secondary Number',
            'PRE_DIR': 'Street Prefix Direction',
            'POST_DIR': 'Street Suffix Direction',
            'PRE_TYPE': 'Street Prefix Type',
            'POST_TYPE': 'Street Type',
            'BASE': 'Street Base Name',
            'REL_LOC': 'Relative Location',
            'SITE_NAME': 'Site Name',
            'SUBSITE': 'Subsite'
        };
    }
    
    async importFromCSV(file) {
        try {
            log('Importing voter data from CSV:', file.name);
            
            const text = await this.readFileAsText(file);
            const lines = text.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                throw new Error('CSV file must have at least a header and one data row');
            }
            
            return this.parseVoterCSV(lines);
            
        } catch (error) {
            error('Error importing CSV:', error);
            throw error;
        }
    }
    
    async importFromGoogleSheets(url) {
        try {
            log('Importing voter data from Google Sheets:', url);

            // Convert Google Sheets URL to CSV export format
            let csvUrl = url;

            // Handle different Google Sheets URL formats
            if (url.includes('/edit')) {
                // Format: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
                const sheetId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
                if (!sheetId) {
                    throw new Error('Could not extract Sheet ID from URL');
                }

                // Try to extract gid (sheet tab ID) if present
                const gidMatch = url.match(/[#&]gid=(\d+)/);
                const gid = gidMatch ? gidMatch[1] : '0';

                csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
            } else if (url.includes('/pub') && url.includes('output=csv')) {
                // Published URL format - already correct, use as-is
                csvUrl = url;
            } else if (!url.includes('export?format=csv') && !url.includes('output=csv')) {
                throw new Error('Please provide a Google Sheets URL (edit or published link)');
            }

            log('Fetching from:', csvUrl);

            // Note: This requires the sheet to be published to the web or shared with "Anyone with the link"
            // File -> Share -> Publish to web -> Link -> Entire Document -> Comma-separated values (.csv)
            const response = await fetch(csvUrl, {
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Sheet not found. Make sure the sheet is published to the web (File → Share → Publish to web) or shared with "Anyone with the link"');
                } else if (response.status === 403) {
                    throw new Error('Access denied. Please make sure the sheet is published to the web or shared publicly');
                }
                throw new Error(`Failed to fetch Google Sheets data: ${response.status} ${response.statusText}. Make sure the sheet is published to web.`);
            }

            const text = await response.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                throw new Error('Google Sheets must have at least a header and one data row');
            }

            return this.parseVoterCSV(lines);

        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('Cannot connect to Google Sheets. The sheet must be published to the web (File → Share → Publish to web → CSV format). CORS restrictions prevent loading unpublished sheets.');
            }
            console.error('Error importing Google Sheets:', error);
            throw error;
        }
    }
    
    parseVoterCSV(lines) {
        const headers = this.parseCSVLine(lines[0]).map(h => h.trim());
        log('CSV headers:', headers);

        // Find MASTER_ADDRESS_ID column
        const locIdIndex = headers.findIndex(h =>
            h.toUpperCase() === 'MASTER_ADDRESS_ID'
        );

        if (locIdIndex === -1) {
            throw new Error('CSV must have an MASTER_ADDRESS_ID column to link voters to address points');
        }

        // Map headers to internal field names
        const fieldMapping = {};
        headers.forEach((header, index) => {
            const trimmedHeader = header.trim();
            const internalName = this.voterFieldMappings[trimmedHeader];
            if (internalName) {
                fieldMapping[index] = internalName;
            }
        });

        log('Field mapping:', fieldMapping);
        
        // Parse voter data
        const voters = [];
        const votersByParcel = new Map(); // MASTER_ADDRESS_ID -> array of voters
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);

            if (values.length <= locIdIndex) {
                errors.push(`Line ${i + 1}: Missing MASTER_ADDRESS_ID`);
                continue;
            }

            const locId = String(values[locIdIndex]).trim();

            if (!locId) {
                errors.push(`Line ${i + 1}: Empty MASTER_ADDRESS_ID`);
                continue;
            }

            // Build voter object
            const voter = {
                _line: i + 1,
                object_id: locId
            };

            // Map all fields
            Object.entries(fieldMapping).forEach(([index, fieldName]) => {
                const value = values[parseInt(index)];
                voter[fieldName] = value !== undefined && value !== null ? String(value).trim() : '';
            });

            voters.push(voter);

            // Group by MASTER_ADDRESS_ID
            if (!votersByParcel.has(locId)) {
                votersByParcel.set(locId, []);
            }
            votersByParcel.get(locId).push(voter);
        }
        
        log(`Parsed ${voters.length} voters across ${votersByParcel.size} parcels`);
        
        if (errors.length > 0) {
            log('Parsing errors:', errors.slice(0, 10)); // Show first 10 errors
        }
        
        return {
            voters,
            votersByParcel,
            totalVoters: voters.length,
            totalParcels: votersByParcel.size,
            errors: errors.slice(0, 100) // Limit errors
        };
    }
    
    linkVotersToLoadedParcels(voterData) {
        if (!this.app.parcelData || !this.app.parcelData.features) {
            throw new Error('No parcel data loaded. Please load towns first.');
        }
        
        // Create a map of MASTER_ADDRESS_ID -> address point feature for quick lookup
        const parcelMap = new Map();
        this.app.parcelData.features.forEach(feature => {
            const objectId = String(feature.properties.MASTER_ADDRESS_ID);
            parcelMap.set(objectId, feature);
        });

        // Check how many voters have matching address points
        const matchedParcels = new Set();
        const unmatchedLocIds = new Set();

        voterData.votersByParcel.forEach((voters, locId) => {
            if (parcelMap.has(locId)) {
                matchedParcels.add(locId);
            } else {
                unmatchedLocIds.add(locId);
            }
        });

        const matchRate = (matchedParcels.size / voterData.votersByParcel.size) * 100;

        log(`Voter linkage: ${matchedParcels.size} address points matched out of ${voterData.votersByParcel.size} (${matchRate.toFixed(1)}%)`);

        if (unmatchedLocIds.size > 0) {
            log(`Unmatched MASTER_ADDRESS_IDs (first 10):`, Array.from(unmatchedLocIds).slice(0, 10));
        }
        
        return {
            matched: matchedParcels.size,
            total: voterData.votersByParcel.size,
            matchRate,
            unmatchedLocIds: Array.from(unmatchedLocIds)
        };
    }
    
    getVotersForParcel(locId) {
        if (!this.app.voterData) return [];
        
        return this.app.voterData.get(String(locId)) || [];
    }
    
    getVoterCount(locId) {
        return this.getVotersForParcel(locId).length;
    }
    
    sortVoters(voters, sortBy = 'alphabetical') {
        const sorted = [...voters];
        
        switch (sortBy) {
            case 'alphabetical':
                sorted.sort((a, b) => {
                    const nameA = a.last_name || a.full_name || '';
                    const nameB = b.last_name || b.full_name || '';
                    return nameA.localeCompare(nameB);
                });
                break;
                
            case 'party':
                sorted.sort((a, b) => {
                    const partyA = a.party || '';
                    const partyB = b.party || '';
                    return partyA.localeCompare(partyB);
                });
                break;
                
            case 'age':
                sorted.sort((a, b) => {
                    const dobA = a.dob ? new Date(a.dob) : new Date(0);
                    const dobB = b.dob ? new Date(b.dob) : new Date(0);
                    return dobA - dobB; // Oldest first
                });
                break;
                
            default:
                // No sorting
                break;
        }
        
        return sorted;
    }
    
    calculateAge(dob) {
        if (!dob) return null;
        
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        return age;
    }
    
    getPartyAbbreviation(party) {
        if (!party) return '';
        
        const p = party.toUpperCase();
        
        if (p.includes('DEM')) return 'D';
        if (p.includes('REP')) return 'R';
        if (p.includes('IND') || p.includes('UNENROLLED')) return 'I';
        if (p.includes('LIB')) return 'L';
        if (p.includes('GREEN')) return 'G';
        
        return party.substring(0, 1).toUpperCase();
    }
    
    formatVoterForDisplay(voter) {
        const age = this.calculateAge(voter.dob);
        const party = this.getPartyAbbreviation(voter.party);
        const name = voter.full_name || `${voter.first_name || ''} ${voter.last_name || ''}`.trim();
        
        return {
            name,
            party,
            age,
            precinct: voter.precinct || '',
            status: voter.status || '',
            electionCount: voter.election_count || '',
            raw: voter
        };
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
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
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
    
    getAvailableVoterFields() {
        // Return fields that exist in the loaded voter data
        if (!this.app.voterData || this.app.voterData.size === 0) {
            return [];
        }
        
        // Get first voter to see what fields exist
        const firstParcelVoters = Array.from(this.app.voterData.values())[0];
        if (!firstParcelVoters || firstParcelVoters.length === 0) {
            return [];
        }
        
        const firstVoter = firstParcelVoters[0];
        const fields = Object.keys(firstVoter).filter(key =>
            !key.startsWith('_') && key !== 'object_id'
        );
        
        return fields;
    }
    
    getDisplayFieldName(fieldName) {
        return this.displayFieldNames[fieldName] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}
