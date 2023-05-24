require("dotenv").config();
const CNA_NORTH_CALIFORNIA = process.env.CNA_NORTH_CALIFORNIA;
const LVN_NORTH_CALIFORNIA = process.env.LVN_NORTH_CALIFORNIA;
const RN_NORTH_CALIFORNIA = process.env.RN_NORTH_CALIFORNIA;

const CNA_SOUTHERN_CALIFORNIA = process.env.CNA_SOUTHERN_CALIFORNIA;
const LVN_SOUTHERN_CALIFORNIA = process.env.LVN_SOUTHERN_CALIFORNIA;
const RN_SOUTHERN_CALIFORNIA = process.env.RN_SOUTHERN_CALIFORNIA;

//Individual
const CNA_H_NORTH_CALIFORNIA = process.env.CNA_H_NORTH_CALIFORNIA;
const LVN_H_NORTH_CALIFORNIA = process.env.LVN_H_NORTH_CALIFORNIA;
const RN_H_NORTH_CALIFORNIA = process.env.RN_H_NORTH_CALIFORNIA;

const CNA_H_SOUTHERN_CALIFORNIA = process.env.CNA_H_SOUTHERN_CALIFORNIA;
const LVN_H_SOUTHERN_CALIFORNIA = process.env.LVN_H_SOUTHERN_CALIFORNIA;
const RN_H_SOUTHERN_CALIFORNIA = process.env.RN_H_SOUTHERN_CALIFORNIA;

const HOMECARE_PROFIT = process.env.HOMECARE_PROFIT;


const northCalifornia = ['alameda', 'albany', 'berkeley', 'dublin', 'emeryville', 'fremont', 'hayward', 'livermore', 'newark', 'oakland', 'piedmont', 'pleasanton', 'san', 'leandro', 'union', 'amador', 'ione', 'jackson', 'plymouth', 'sutter', 'creek', 'biggs', 'chico', 'gridley', 'oroville', 'paradise', 'angels', 'camp', 'colusa', 'williams', 'antioch', 'brentwood', 'clayton', 'concord', 'danville', 'el', 'cerrito', 'hercules', 'lafayette', 'martinez', 'moraga', 'oakley', 'orinda', 'pinole', 'pittsburg', 'pleasant', 'hill', 'richmond', 'san', 'pablo', 'san', 'ramon', 'walnut', 'creek', 'crescent', 'placerville', 'south', 'lake', 'tahoe', 'clovis', 'coalinga', 'firebaugh', 'fowler', 'fresno', 'huron', 'kerman', 'kingsburg', 'mendota', 'orange', 'cove', 'parlier', 'reedley', 'sanger', 'san', 'joaquin', 'selma', 'orland', 'arcata', 'blue', 'lake', 'eureka', 'ferndale', 'fortuna', 'rio', 'dell', 'trindad', 'no', 'websites', 'corcoran', 'hanford', 'lemoore', 'clearlake', 'lakeport', 'susanville', 'chowchilla', 'madera', 'belvedere', 'corte', 'madera', 'fairfax', 'larkspar', 'mill', 'valley', 'novato', 'ross', 'san', 'anselmo', 'san', 'rafael', 'sausalito', 'tiburon', 'fort', 'bragg', 'point', 'arena', 'ukiah', 'willits', 'atwater', 'gustine', 'livingston', 'los', 'banos', 'merced', 'alturus', 'mammoth', 'lakes', 'carmel-by-the-sea', 'del', 'rey', 'oaks', 'gonzales', 'greenfield', 'king', 'marina', 'monterey', 'pacific', 'grove', 'salinas', 'sand', 'seaside', 'soledad', 'american', 'canyon', 'calistoga', 'napa', 'st.', 'helena', 'yountville', 'grass', 'valley', 'nevada', 'truckee', 'auburn', 'colfax', 'lincoln', 'loomis', 'rocklin', 'roseville', 'portola', 'citris', 'heights', 'elk', 'grove', 'folsom', 'galt', 'rancho', 'cordova', 'sacramento', 'hollister', 'san', 'juan', 'bautista', 'escalon', 'lathrop', 'lodi', 'manteca', 'ripon', 'stockton', 'tracy', 'belmont', 'brisbane', 'burlingame', 'colma', 'daly', 'east', 'palo', 'alto', 'foster', 'half', 'moon', 'bay', 'hillsborough', 'menlo', 'park', 'millbrae', 'pacifica', 'redwood', 'san', 'bruno', 'san', 'carlos', 'san', 'mateo', 'south', 'san', 'francisco', 'campbell', 'cupertino', 'gilroy', 'los', 'altos', 'los', 'altos', 'hills', 'los', 'gatos', 'milpitas', 'monte', 'sereno', 'morgan', 'hill', 'mountain', 'view', 'palo', 'alto', 'san', 'jose', 'santa', 'clara', 'saratoga', 'sunnyvale', 'capitola', 'santa', 'cruz', 'scotts', 'valley', 'watsonville', 'anderson', 'redding', 'shasta', 'lake', 'benicia', 'dixon', 'fairfield', 'rio', 'vista', 'suisun', 'vacaville', 'vallejo', 'cloverdale', 'cotati', 'healdsburg', 'petaluma', 'rohnert', 'park', 'santa', 'rosa', 'sebastopol', 'sonoma', 'windsor', 'ceres', 'hughson', 'modesto', 'newman', 'oakdale', 'patterson', 'riverbank', 'turlock', 'waterford', 'live', 'oak', 'yuba', 'corning', 'red', 'bluff', 'tahama', 'dinuba', 'exeter', 'lindsay', 'porterville', 'tulare', 'visalia', 'woodlake', 'sonora', 'davis', 'west', 'sacramento', 'winters', 'woodlands', 'marysville', 'wheatland']
const southernCalifornia = ['juruba valley','brawley', 'calexico', 'el centro', 'holtville', 'imperial', 'westmorland', 'arvin', 'bakersfield', 'california', 'delano', 'ridgecrest', 'shafter', 'taft', 'tehachapi', 'wasco', 'agoura hills', '', 'alhambra', 'arcadia', 'artesia', 'avalon', 'azusa', 'baldwin park', 'bell', 'bellflower', 'bell gardens', 'beverley hills', 'bradbury', 'burbank', 'calabasas', 'carson', 'cerritos', 'claremont', 'commerce', 'compton', 'covina', 'cudahy', 'culver', 'diamond bar', 'downey', 'el monte', 'el segundo', 'gardena', 'glendale', 'hawaiian gardens', 'hawthorne', 'hermosa beach', 'hidden hills', 'huntington park', 'industry', 'inglewood', 'irwindale', 'la canada flintridge', 'la habra heights', 'lakewood', 'la mirada', 'lancaster', 'la puente', 'la verne', 'lawndale', 'lomita', 'long beach', 'los angeles', 'lynwood', 'malibu', 'manhatten beach', 'maywood', 'monrovia', 'montebello', 'monterey park', 'norwalk', 'palmdale', 'palos verdes estates', 'paramount', 'pasadena', 'pico rivera', 'pomona', 'rancho palos', 'verdes', 'redondo beach', 'rolling hills', 'rolling hills', 'estates', 'rosemead', 'san dimas', 'san fernando', 'san gabriel', 'san marino', 'santa clarita', 'santa fe springs', 'santa monica', 'sierra madre', 'signal hill', 'south el monte', 'south gate', 'south pasadena', 'temple', 'torrance', 'vernon', 'walnut', 'west covina', 'west hollywood', 'westlake village', 'whittier', 'aliso viejo', 'anaheim', 'brea', 'buena park', 'costa mesa', 'cypress', 'dana point', 'fountain valley', 'fullerton', 'garden grove', 'huntington beach', 'irvine', 'laguna beach', 'laguna hills', 'laguna niguel', 'laguna woods', 'la habra', 'lake forest', 'la palma', 'los alamitos', 'mission viejo', 'newport beach', 'orange', 'placentia', 'rancho santa', 'margarita', 'san clemente', 'san juan capistrano', 'santa ana', 'seal beach', 'stanton', 'tustin', 'villa park', 'westminster', 'yorba linda', 'banning', 'beaumont', 'blythe', 'calimesa', 'canyon lake', 'cathedral', 'coachella', 'corona', 'desert hot springs', 'hemet', 'indian wells', 'indio', 'lake elsinore', 'la quinta', 'menifee', 'moreno valley', 'murrieta', 'norco', 'palm desert', 'palm springs', 'perris', 'rancho mirage', 'riverside', 'san jacinto', 'temecula', 'wildomar', 'adelanto', 'apple valley', 'barstow', 'big bear lake', 'chino', 'chino hills', 'colton', 'fontana', 'grand terrace', 'hesperia', 'highland', 'loma linda', 'montclair', 'needles', 'ontario', 'rancho cucamonga', 'redlands', 'rialto', 'san bernadino', 'twentynine palms', 'upland', 'victorville', 'yucaipa', 'yucca valley', 'carlsbad', 'chula vista', 'coronado', 'del mar', 'el cajon', 'encinitas', 'escondido', 'imperial beach', 'la mesa', 'lemon grove', 'national', 'oceanside', 'poway', 'san diego', 'san marcos', 'santee', 'solana beach', 'vista', 'arroyo grande', 'atascadero', 'atherton', 'el paso de robles', 'grover beach', 'morro bay', 'prismo beach', 'san luis obispo', 'buellton', 'carpinteria', 'goleta', 'guadalupe', 'lompoc', 'santa barbara', 'santa maria', 'solvang', 'camarillo', 'fillmore', 'moorpark', 'ojai', 'oxnard', 'port hueneme', 'santa paula', 'simi valley', 'thousand oaks', 'ventura']

function minimumPrice(city,invoice_rate,role) {
    var minimum = false
    var erorrMessage = ''
    if(northCalifornia.includes(city.toLowerCase())){
        switch (role) {
            case 'HomeCare Aide':
                if(invoice_rate < CNA_NORTH_CALIFORNIA){
                    minimum = true  
                    erorrMessage = `Minimum rate for CNA North california cities is $${CNA_NORTH_CALIFORNIA}/hr`
                }
                break;
            case 'LVN | LPN':
                if(invoice_rate < LVN_NORTH_CALIFORNIA){
                    minimum = true  
                    erorrMessage = `Minimum rate for LVN/LPN North california cities is $${LVN_NORTH_CALIFORNIA}/hr`
                }
                break;
            case 'RN':
                if(invoice_rate < RN_NORTH_CALIFORNIA){
                    minimum = true  
                    erorrMessage = `Minimum rate for RN North california cities is $${RN_NORTH_CALIFORNIA}/hr`
                }
                break;
        }
    }else if(southernCalifornia.includes(city.toLowerCase())){
        switch (role) {
            case 'HomeCare Aide':
                if(invoice_rate < CNA_SOUTHERN_CALIFORNIA){
                    minimum = true  
                    erorrMessage = `Minimum rate for CNA South california cities is $${CNA_SOUTHERN_CALIFORNIA}/hr`
                }
                break;
            case 'LVN | LPN':
                if(invoice_rate < LVN_SOUTHERN_CALIFORNIA){
                    minimum = true  
                    erorrMessage = `Minimum rate for LVN/LPN South california cities is $${LVN_SOUTHERN_CALIFORNIA}/hr`
                }
                break;
            case 'RN':
                if(invoice_rate < RN_SOUTHERN_CALIFORNIA){
                    minimum = true  
                    erorrMessage = `Minimum rate for RN South california cities is $${RN_SOUTHERN_CALIFORNIA}/hr`
                }
                break;
        }
    }else{
        const highestAmount = getHighestAmount(role)
        if(invoice_rate < highestAmount.minimum_invoice){
            minimum = true  
            erorrMessage = highestAmount.error
        }
    }
    return {minimum,erorr_message:erorrMessage}
}

function getHighestAmount(role) {
    switch (role) {
        case 'HomeCare Aide':
            return {minimum_invoice:Math.max(...[CNA_NORTH_CALIFORNIA,CNA_SOUTHERN_CALIFORNIA]),error:`Minimum rate for CNA is $${Math.max(...[CNA_NORTH_CALIFORNIA,CNA_SOUTHERN_CALIFORNIA])}/hr`};
        case 'LVN | LPN':
            return {minimum_invoice:Math.max(...[LVN_NORTH_CALIFORNIA,LVN_SOUTHERN_CALIFORNIA]),error:`Minimum rate for LVN/LPN is $${Math.max(...[LVN_NORTH_CALIFORNIA,LVN_SOUTHERN_CALIFORNIA])}/hr`};
        case 'RN':
            return {minimum_invoice:Math.max(...[RN_NORTH_CALIFORNIA,RN_SOUTHERN_CALIFORNIA]),error:`Minimum rate for RN is $${Math.max(...[RN_NORTH_CALIFORNIA,RN_SOUTHERN_CALIFORNIA])}/hr`};
    }
}

function minimumPriceIndividual(city,hours,role) {
    var invoice_rate = 0.0
    var invoice_rate_staff = 0.0
    if(northCalifornia.includes(city.toLowerCase())){
        switch (role) {
            case 'HomeCare Aide':
                invoice_rate = CNA_H_NORTH_CALIFORNIA * hours
                invoice_rate_staff = (((100 - HOMECARE_PROFIT) / 100) *  CNA_H_NORTH_CALIFORNIA ) * hours
                break;
            case 'LVN | LPN':
                invoice_rate = LVN_H_NORTH_CALIFORNIA * hours
                invoice_rate_staff = (((100 - HOMECARE_PROFIT) / 100) *  LVN_H_NORTH_CALIFORNIA ) * hours
                break;
            case 'RN':
                invoice_rate = RN_H_NORTH_CALIFORNIA * hours
                invoice_rate_staff = (((100 - HOMECARE_PROFIT) / 100) *  RN_H_NORTH_CALIFORNIA ) * hours
                break;
        }
    }else if(southernCalifornia.includes(city.toLowerCase())){
        switch (role) {
            case 'HomeCare Aide':
                invoice_rate = CNA_H_SOUTHERN_CALIFORNIA * hours
                invoice_rate_staff = (((100 - HOMECARE_PROFIT) / 100) *  CNA_H_SOUTHERN_CALIFORNIA ) * hours
                break;
            case 'LVN | LPN':
                invoice_rate = LVN_H_SOUTHERN_CALIFORNIA * hours
                invoice_rate_staff = (((100 - HOMECARE_PROFIT) / 100) *  LVN_H_SOUTHERN_CALIFORNIA ) * hours
                break;
            case 'RN':
                invoice_rate = RN_H_SOUTHERN_CALIFORNIA * hours
                invoice_rate_staff = (((100 - HOMECARE_PROFIT) / 100) *  RN_H_SOUTHERN_CALIFORNIA ) * hours
                break;
        }
    }else{
        const response = getHighestAmountIndividual(role,hours)
        invoice_rate = response.invoice_rate
        invoice_rate_staff = response.invoice_rate_staff
    }

     return {invoice_rate:invoice_rate.toFixed(2),invoice_rate_staff:(invoice_rate_staff).toFixed(2)}
}

function getHighestAmountIndividual(role,hours) {
    switch (role) {
        case 'HomeCare Aide':
            var invoice_rate = Math.max(...[CNA_H_NORTH_CALIFORNIA,CNA_H_SOUTHERN_CALIFORNIA])
            return {invoice_rate:invoice_rate * hours,invoice_rate_staff:(((100 - HOMECARE_PROFIT) / 100) *  invoice_rate) * hours}
        case 'LVN | LPN':
            var invoice_rate = Math.max(...[LVN_H_NORTH_CALIFORNIA,LVN_H_SOUTHERN_CALIFORNIA])
            return {invoice_rate:invoice_rate * hours,invoice_rate_staff:(((100 - HOMECARE_PROFIT) / 100) *  invoice_rate) * hours}
        case 'RN':
            var invoice_rate = Math.max(...[RN_H_NORTH_CALIFORNIA,RN_H_SOUTHERN_CALIFORNIA])
            return {invoice_rate:invoice_rate * hours,invoice_rate_staff:(((100 - HOMECARE_PROFIT) / 100) *  invoice_rate) * hours}
    }
}


module.exports = {
    minimumPrice,
    minimumPriceIndividual
};