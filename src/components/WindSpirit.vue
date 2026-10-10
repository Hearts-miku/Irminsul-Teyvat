<script setup lang="ts">
withDefaults(defineProps<{ state?:string }>(),{state:'idle'});
</script>
<template>
  <svg class="wind-spirit" :class="`spirit-${state}`" viewBox="0 0 200 210" fill="none" aria-label="风语精灵" role="img">
    <defs><linearGradient id="spirit-coat" x1="55" y1="75" x2="145" y2="170" gradientUnits="userSpaceOnUse"><stop stop-color="#F5F7E6"/><stop offset="1" stop-color="#ADCCAE"/></linearGradient><radialGradient id="spirit-face"><stop stop-color="#FFFDF2"/><stop offset="1" stop-color="#F2EBD2"/></radialGradient></defs>
    <ellipse class="spirit-shadow" cx="100" cy="190" rx="38" ry="7" fill="#365B45" opacity=".13"/>
    <g class="spirit-float">
      <path d="M71 58C44 55 37 30 51 15C70 20 82 40 77 55" fill="#98BB91"/><path d="M79 56C76 32 101 12 119 18C117 39 102 56 83 60" fill="#D6DFAC"/><path d="M60 32L77 63M102 34L82 63" stroke="#668B6A" stroke-width="2.5" stroke-linecap="round"/>
      <ellipse cx="101" cy="61" rx="52" ry="12" transform="rotate(-12 101 61)" stroke="#C7AD64" stroke-width="2"/>
      <path d="M57 106C36 101 21 114 19 130C37 132 48 131 57 124M144 106C164 95 181 106 185 121C170 130 154 132 144 124" fill="#B9D2B6"/>
      <path d="M53 114C48 144 62 163 50 176C73 183 83 171 95 179C104 190 120 171 135 176C155 181 165 167 151 154C147 143 151 130 147 112Z" fill="url(#spirit-coat)" stroke="#90B194" stroke-width="1.5"/>
      <path d="M48 99C48 67 71 55 99 55C130 55 152 74 152 102C152 130 130 140 100 140C68 140 48 125 48 99Z" fill="url(#spirit-face)" stroke="#B5C7A3" stroke-width="2"/>
      <path d="M54 88C54 67 72 59 96 57C71 74 70 78 54 88Z" fill="#D5DFC0"/>
      <g class="spirit-eyes"><ellipse cx="79" cy="103" rx="4.5" ry="6" fill="#3F5747"/><ellipse cx="120" cy="103" rx="4.5" ry="6" fill="#3F5747"/><circle cx="80" cy="101" r="1.5" fill="white"/><circle cx="121" cy="101" r="1.5" fill="white"/></g>
      <ellipse cx="66" cy="115" rx="7" ry="3.5" fill="#DCAD97" opacity=".5"/><ellipse cx="133" cy="115" rx="7" ry="3.5" fill="#DCAD97" opacity=".5"/>
      <path class="spirit-mouth" d="M94 116Q100 122 106 116" stroke="#63725C" stroke-width="2" stroke-linecap="round"/>
      <path d="M100 141L109 151L100 162L91 151Z" fill="#C9AC63"/><path d="M100 145L105 151L100 157L96 151Z" fill="#FFF2C7"/>
    </g>
    <path class="spirit-spark" d="M163 55L166 64L175 67L166 70L163 79L160 70L151 67L160 64Z" fill="#D3BA72"/>
    <circle cx="32" cy="74" r="2.5" fill="#ABC39A"/>
  </svg>
</template>
