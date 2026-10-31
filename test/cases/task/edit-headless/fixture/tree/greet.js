/*  a tiny greeting CLI serving as the fixture code base  */

const greet = (name) => `Hello, ${name}!`

const main = () => {
    const name = process.argv[2]
    console.log(greet(name))
}

main()
