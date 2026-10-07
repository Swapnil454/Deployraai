package core

import "time"

var imfMonths = [12]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

func twoDigits(b []byte) (int, bool) {
	if b[0] < '0' || b[0] > '9' || b[1] < '0' || b[1] > '9' {
		return 0, false
	}
	return int(b[0]-'0')*10 + int(b[1]-'0'), true
}

// parseIMFFixdate parses the only HTTP date format servers should emit today,
// e.g. "Sun, 06 Nov 1994 08:49:37 GMT", with zero allocations.
// Obsolete RFC 850 / asctime forms return ok=false; Stage 1 treats that as "unusable".
func parseIMFFixdate(b []byte) (time.Time, bool) {
	if len(b) != 29 || b[3] != ',' || b[4] != ' ' || b[7] != ' ' || b[11] != ' ' ||
		b[16] != ' ' || b[19] != ':' || b[22] != ':' || string(b[25:]) != " GMT" {
		return time.Time{}, false
	}
	day, ok1 := twoDigits(b[5:7])
	cc, ok2 := twoDigits(b[12:14])
	yy, ok3 := twoDigits(b[14:16])
	hh, ok4 := twoDigits(b[17:19])
	mi, ok5 := twoDigits(b[20:22])
	ss, ok6 := twoDigits(b[23:25])
	if !(ok1 && ok2 && ok3 && ok4 && ok5 && ok6) {
		return time.Time{}, false
	}
	mon := 0
	for i, m := range imfMonths {
		if string(b[8:11]) == m { // comparison form: no allocation in Go compiler
			mon = i + 1
			break
		}
	}
	if mon == 0 || day < 1 || day > 31 || hh > 23 || mi > 59 || ss > 60 {
		return time.Time{}, false
	}
	return time.Date(cc*100+yy, time.Month(mon), day, hh, mi, ss, 0, time.UTC), true
}
