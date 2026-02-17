/*
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

export class DataViewWriter {
    buffer: number[] = []

    uint8(val: number) {
        this.buffer.push(val & 0xff)
    }

    uint16(val: number) {
        this.buffer.push(val & 0xff)
        this.buffer.push((val >> 8) & 0xff)
    }

    uint32(val: number) {
        this.buffer.push(val & 0xff)
        this.buffer.push((val >> 8) & 0xff)
        this.buffer.push((val >> 16) & 0xff)
        this.buffer.push((val >> 24) & 0xff)
    }

    dump(): number[] {
        return this.buffer
    }
}
