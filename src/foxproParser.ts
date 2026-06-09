export class FoxProParser {
    
    // Decodes an ArrayBuffer using windows-1252 (or utf-8)
    private decodeString(buffer: ArrayBuffer, offset: number, length: number): string {
        const slice = buffer.slice(offset, offset + length);
        const decoder = new TextDecoder('windows-1252');
        let str = decoder.decode(slice);
        // Remove nulos se houver
        const nullIdx = str.indexOf('\0');
        if (nullIdx !== -1) {
            str = str.substring(0, nullIdx);
        }
        return str.trim();
    }

    private getMemoText(fptBuffer: ArrayBuffer, blockNumber: number, blockSize: number): string {
        if (blockNumber === 0) return '';
        
        const offset = blockNumber * blockSize;
        if (offset >= fptBuffer.byteLength) return '';

        const view = new DataView(fptBuffer);
        const blockType = view.getUint32(offset, false); // Big Endian
        const dataLength = view.getUint32(offset + 4, false); // Big Endian

        // Type 1 é texto no FoxPro
        if (blockType !== 1) return '';
        
        return this.decodeString(fptBuffer, offset + 8, dataLength);
    }

    private sortMethods(methodsText: string): string {
        const methodLines = methodsText.split(/\r?\n/);
        const methodBlocks: { name: string, content: string[] }[] = [];
        let currentName = '_TOP_LEVEL';
        let currentContent: string[] = [];

        for (const line of methodLines) {
            const match = line.match(/^\s*(?:PROCEDURE|FUNCTION)\s+([a-zA-Z0-9_]+)/i);
            if (match) {
                // Save previous block if it has content
                if (currentContent.length > 0) {
                    methodBlocks.push({ name: currentName, content: currentContent });
                }
                currentName = match[1].toUpperCase();
                currentContent = [line];
            } else {
                currentContent.push(line);
            }
        }
        if (currentContent.length > 0) {
            methodBlocks.push({ name: currentName, content: currentContent });
        }

        // Sort by name
        methodBlocks.sort((a, b) => a.name.localeCompare(b.name));

        return methodBlocks.map(b => b.content.join('\n').trimEnd()).filter(text => text.length > 0).join('\n\n');
    }

    public parse(scxBuffer: ArrayBuffer, sctBuffer: ArrayBuffer): string {
        const scxView = new DataView(scxBuffer);
        const sctView = new DataView(sctBuffer);

        // Header do FPT
        const blockSize = sctView.getUint16(6, false); // Big Endian

        // Header do SCX
        const numRecords = scxView.getUint32(4, true); // Little Endian
        const headerLength = scxView.getUint16(8, true);
        const recordLength = scxView.getUint16(10, true);

        // Parse fields
        const fields: Array<{name: string, type: string, length: number, offset: number}> = [];
        let currentOffset = 32;
        let recordOffset = 1; // primeiro byte é a flag de delete

        while (currentOffset < headerLength) {
            const firstByte = scxView.getUint8(currentOffset);
            if (firstByte === 0x0D) break; // Fim dos fields

            const name = this.decodeString(scxBuffer, currentOffset, 11);
            const type = String.fromCharCode(scxView.getUint8(currentOffset + 11));
            const length = scxView.getUint8(currentOffset + 16);

            fields.push({
                name,
                type,
                length,
                offset: recordOffset
            });

            recordOffset += length;
            currentOffset += 32;
        }

        const objects: Record<string, {properties: string, methods: string}> = {};

        // Parse records
        for (let i = 0; i < numRecords; i++) {
            const rowOffset = headerLength + (i * recordLength);
            
            // Check delete flag
            if (rowOffset >= scxBuffer.byteLength) break;
            const isDeleted = scxView.getUint8(rowOffset) === 0x2A;
            if (isDeleted) continue;

            let objName = '';
            let properties = '';
            let methods = '';

            for (const field of fields) {
                const fieldOffset = rowOffset + field.offset;
                
                if (field.name === 'OBJNAME') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        objName = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    } else {
                        objName = this.decodeString(scxBuffer, fieldOffset, field.length);
                    }
                } else if (field.name === 'PROPERTIES') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        properties = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    }
                } else if (field.name === 'METHODS') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        methods = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    }
                }
            }

            if (objName) {
                objects[objName] = { properties, methods };
            }
        }

        // Generate output string similar to BeyondCompare text
        let output = '';
        
        // Sorteando os nomes para ser determinístico
        const sortedNames = Object.keys(objects).sort();

        for (const name of sortedNames) {
            const { properties, methods } = objects[name];
            
            if (properties.trim()) {
                output += `<Form.${name} Properties>\n`;
                // Identar as propriedades levemente igual no fox
                const lines = properties.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        output += `   ${line.trim()}\n`;
                    }
                }
                output += `</Form.${name} Properties>\n`;
            }
            
            const sortedMethods = this.sortMethods(methods);
            if (sortedMethods.trim()) {
                output += `<Form.${name} Methods>\n`;
                output += sortedMethods.trim() + '\n';
                output += `</Form.${name} Methods>\n\n`;
            }
        }

        return output;
    }
}
