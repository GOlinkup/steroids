export default {
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  output: {
    globals: {
      'react': 'React',
      'react-dom': 'ReactDOM',
      'react/jsx-runtime': 'jsxRuntime'
    }
  }
}
