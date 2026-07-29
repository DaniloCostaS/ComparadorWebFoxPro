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

    private sortMethods(methodsText: string, objName: string): string {
        const methodLines = methodsText.split(/\r?\n/);
        const methodBlocks: { name: string, content: string[] }[] = [];
        let currentName = '_TOP_LEVEL';
        let currentContent: string[] = [];

        for (const line of methodLines) {
            const match = line.match(/^\s*(?:PROCEDURE|PROC|FUNCTION|FUNC)\s+([a-zA-Z0-9_.]+)/i);
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



        let output = '';
        for (const block of methodBlocks) {
            if (block.name === '_TOP_LEVEL') {
                if (block.content.join('').trim()) {
                    output += `<Object.${objName} Method._TopLevel>\n`;
                    output += block.content.join('\n').trimEnd() + '\n';
                    output += `</Object.${objName} Method._TopLevel>\n\n`;
                }
            } else {
                output += `<Object.${objName} Method.${block.name}>\n`;
                output += block.content.join('\n').trimEnd() + '\n';
                output += `</Object.${objName} Method.${block.name}>\n\n`;
            }
        }
        return output.trimEnd() + '\n';
    }

    public parsePrg(prgText: string): string {
        const methodLines = prgText.split(/\r?\n/);
        const methodBlocks: { name: string, content: string[] }[] = [];
        let currentName = '_TOP_LEVEL';
        let currentContent: string[] = [];

        for (const line of methodLines) {
            const match = line.match(/^\s*(?:PROCEDURE|PROC|FUNCTION|FUNC)\s+([a-zA-Z0-9_.]+)/i);
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



        let output = '';
        for (const block of methodBlocks) {
            if (block.name === '_TOP_LEVEL') {
                if (block.content.join('').trim()) {
                    output += `<PRG_TopLevel>\n`;
                    output += block.content.join('\n').trimEnd() + '\n';
                    output += `</PRG_TopLevel>\n\n`;
                }
            } else {
                output += `<PRG_Method ${block.name}>\n`;
                output += block.content.join('\n').trimEnd() + '\n';
                output += `</PRG_Method ${block.name}>\n\n`;
            }
        }
        return output.trimEnd() + '\n';
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

        const objects: Record<string, {properties: string, methods: string, expr: string, tag: string, tag2: string, picture: string}> = {};

        // Parse records
        for (let i = 0; i < numRecords; i++) {
            const rowOffset = headerLength + (i * recordLength);
            
            // Check delete flag
            if (rowOffset >= scxBuffer.byteLength) break;
            const isDeleted = scxView.getUint8(rowOffset) === 0x2A;
            if (isDeleted) continue;

            let objName = '';
            let parentName = '';
            let properties = '';
            let methods = '';
            let expr = '';
            let tag = '';
            let tag2 = '';
            let picture = '';

            for (const field of fields) {
                const fieldOffset = rowOffset + field.offset;
                
                if (field.name === 'OBJNAME' || field.name === 'NAME') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        objName = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    } else {
                        objName = this.decodeString(scxBuffer, fieldOffset, field.length);
                    }
                } else if (field.name === 'PARENT') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        parentName = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    } else {
                        parentName = this.decodeString(scxBuffer, fieldOffset, field.length);
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
                } else if (field.name === 'EXPR') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        expr = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    }
                } else if (field.name === 'TAG') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        tag = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    }
                } else if (field.name === 'TAG2') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        tag2 = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    }
                } else if (field.name === 'PICTURE') {
                    if (field.type === 'M') {
                        const blockNumber = scxView.getUint32(fieldOffset, true);
                        picture = this.getMemoText(sctBuffer, blockNumber, blockSize);
                    }
                }
            }

            // Fallback for FRX objects that might not have a clear name
            if (!objName) {
                objName = `Row_${i}`;
            }

            if (objName) {
                // If PARENT is present, prepend it to make the name unique by its hierarchy
                if (parentName.trim()) {
                    objName = `${parentName.trim()}.${objName.trim()}`;
                }
                
                // Fallback collision handler just in case
                if (objects[objName]) {
                    let counter = 2;
                    while (objects[`${objName}_${counter}`]) {
                        counter++;
                    }
                    objName = `${objName}_${counter}`;
                }

                objects[objName] = { properties, methods, expr, tag, tag2, picture };
            }
        }

        // Generate output string similar to BeyondCompare text
        let output = '';
        
        // Sorteando os nomes para ser determinístico
        const sortedNames = Object.keys(objects).sort();

        for (const name of sortedNames) {
            const { properties, methods, expr, tag, tag2, picture } = objects[name];
            
            if (properties.trim()) {
                output += `<Object.${name} Properties>\n`;
                // Identar as propriedades levemente igual no fox
                const lines = properties.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        output += `   ${line.trim()}\n`;
                    }
                }
                output += `</Object.${name} Properties>\n`;
            }
            
            const sortedMethods = this.sortMethods(methods, name);
            if (sortedMethods.trim()) {
                output += sortedMethods.trim() + '\n\n';
            }

            if (expr.trim()) {
                output += `<Object.${name} EXPR>\n`;
                const lines = expr.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        output += `   ${line.trim()}\n`;
                    }
                }
                output += `</Object.${name} EXPR>\n\n`;
            }

            if (tag.trim()) {
                output += `<Object.${name} TAG>\n`;
                const lines = tag.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        output += `   ${line.trim()}\n`;
                    }
                }
                output += `</Object.${name} TAG>\n\n`;
            }

            if (tag2.trim()) {
                output += `<Object.${name} TAG2>\n`;
                const lines = tag2.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        output += `   ${line.trim()}\n`;
                    }
                }
                output += `</Object.${name} TAG2>\n\n`;
            }

            if (picture.trim()) {
                output += `<Object.${name} PICTURE>\n`;
                const lines = picture.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        output += `   ${line.trim()}\n`;
                    }
                }
                output += `</Object.${name} PICTURE>\n\n`;
            }
        }

        return output;
    }
}
